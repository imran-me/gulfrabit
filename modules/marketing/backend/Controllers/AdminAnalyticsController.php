<?php

declare(strict_types=1);

namespace Modules\Marketing\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Marketing\Models\TrackingEvent;
use Modules\Marketing\Services\AnalyticsService;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The pixel dashboard: how many people came, and where they left.
 *
 * HTTP shaping only - every number is computed in AnalyticsService, so the
 * funnel is defined in one place rather than drifting between the screen, the
 * export and whatever asks next.
 *
 * Behind the same capability as the orders screen. This data describes the
 * shop's revenue from a different angle, and anyone trusted with one is
 * trusted with the other; nobody else sees either.
 */
class AdminAnalyticsController extends Controller
{
    public function __construct(private readonly AnalyticsService $analytics)
    {
    }

    /** Headline numbers, the funnel, top pages, campaigns, CAPI health. */
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->analytics->summary($this->days($request))]);
    }

    /** Recent visits, one row each. */
    public function sessions(Request $request): JsonResponse
    {
        $data = $request->validate([
            'days'   => ['sometimes', 'integer', 'in:1,7,30,90'],
            'limit'  => ['sometimes', 'integer', 'between:1,200'],
            'offset' => ['sometimes', 'integer', 'min:0'],
        ]);

        return response()->json([
            'data' => $this->analytics->sessions(
                $this->days($request),
                (int) ($data['limit'] ?? 50),
                (int) ($data['offset'] ?? 0),
            ),
        ]);
    }

    /** One visit's footprint, in order. */
    public function footprint(string $session): JsonResponse
    {
        return response()->json(['data' => $this->analytics->footprint($session)]);
    }

    /**
     * The raw events as CSV.
     *
     * Streamed, not built in memory: a busy month is hundreds of thousands of
     * rows, and a merchant who asks for "everything" on a shared host should
     * get a download rather than a 500 from the memory limit.
     *
     * Deliberately the RAW rows, not the summary. An export exists so the data
     * can be taken somewhere this screen cannot follow - a spreadsheet, an
     * accountant, another tool - and a pre-aggregated export can only answer
     * the questions this screen already answers.
     */
    public function export(Request $request): StreamedResponse
    {
        $days = $this->days($request);
        $name = sprintf('gulfrabit-events-%dd-%s.csv', $days, now()->format('Y-m-d'));

        return response()->streamDownload(function () use ($days): void {
            $out = fopen('php://output', 'wb');

            // A BOM, so Excel opens Bengali content and the taka sign as UTF-8
            // instead of mojibake. Without it every product name in this file
            // is unreadable in the tool most merchants will open it with.
            fwrite($out, "\xEF\xBB\xBF");

            fputcsv($out, [
                'timestamp', 'event', 'visitor_id', 'session_id', 'path',
                'value_taka', 'currency', 'content_name', 'num_items',
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                'referrer', 'capi_status', 'event_id',
            ]);

            TrackingEvent::query()
                ->inWindow($days)
                ->orderBy('id')
                // chunkById, not chunk: an offset walk over a table still being
                // written to skips rows as new ones shift the pages under it.
                ->chunkById(1000, function ($rows) use ($out): void {
                    foreach ($rows as $e) {
                        fputcsv($out, [
                            $e->created_at?->format('Y-m-d H:i:s'),
                            $e->event_name,
                            $e->visitor_id,
                            $e->session_id,
                            $e->path,
                            // Taka here, poisha in the database - the same rule
                            // as everywhere else. A spreadsheet full of 46000
                            // where the shop charged 460 is a support ticket.
                            $e->valueTaka(),
                            $e->currency,
                            $e->content_name,
                            $e->num_items,
                            $e->utm_source,
                            $e->utm_medium,
                            $e->utm_campaign,
                            $e->utm_content,
                            $e->referrer,
                            $e->capi_status,
                            $e->event_id,
                        ]);
                    }
                });

            fclose($out);
        }, $name, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * The window, clamped to a known set.
     *
     * A closed set rather than a free integer: an unbounded ?days= is an
     * invitation to full-table scan the busiest table in the shop from a URL.
     */
    private function days(Request $request): int
    {
        $days = (int) $request->query('days', 7);

        return in_array($days, [1, 7, 30, 90], true) ? $days : 7;
    }
}
