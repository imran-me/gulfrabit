<?php

declare(strict_types=1);

namespace Modules\Marketing\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Marketing\Services\AnalyticsService;
use Modules\Marketing\Services\InsightEngine;
use Modules\Marketing\Services\TrackerFilter;
use Modules\Marketing\Services\TrackerReports;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The Tracking screen: who came, from where, on what, and where they left.
 *
 * HTTP shaping only. Every number is computed in the services, against one
 * TrackerFilter built from the query string - so the headline, the chart and
 * every tab read the same slice of visits, and the export is that same slice
 * as raw rows.
 *
 * ONE ENDPOINT PER TAB
 * --------------------
 * The overview paints first; each tab fetches when it is opened. A single
 * endpoint returning everything would make the merchant wait for the product
 * report to open the page, and would run the whole screen's queries every
 * time the live view ticks.
 *
 * Behind the same capability as the orders screen. This data describes the
 * shop's revenue from a different angle, and anyone trusted with one is
 * trusted with the other; nobody else sees either.
 */
class AdminAnalyticsController extends Controller
{
    public function __construct(
        private readonly AnalyticsService $analytics,
        private readonly TrackerReports $reports,
        private readonly InsightEngine $insights,
    ) {
    }

    /** Headline numbers against the comparison period, the chart, the funnel. */
    public function index(Request $request): JsonResponse
    {
        return $this->json($this->analytics->overview(TrackerFilter::fromRequest($request)));
    }

    /** What the numbers mean, in sentences. Fetched after the overview paints. */
    public function insights(Request $request): JsonResponse
    {
        return $this->json(['insights' => $this->insights->for(TrackerFilter::fromRequest($request))]);
    }

    /** Who is on the shop now, and the last hour as it happened. */
    public function live(Request $request): JsonResponse
    {
        return $this->json($this->analytics->live(TrackerFilter::fromRequest($request)));
    }

    public function sources(Request $request): JsonResponse
    {
        return $this->json($this->reports->sources(TrackerFilter::fromRequest($request)));
    }

    public function audience(Request $request): JsonResponse
    {
        return $this->json($this->reports->audience(TrackerFilter::fromRequest($request)));
    }

    public function products(Request $request): JsonResponse
    {
        $sort = (string) $request->query('sort', 'views');

        return $this->json($this->reports->products(TrackerFilter::fromRequest($request), $sort));
    }

    public function search(Request $request): JsonResponse
    {
        return $this->json($this->reports->search(TrackerFilter::fromRequest($request)));
    }

    public function checkout(Request $request): JsonResponse
    {
        return $this->json($this->reports->checkout(TrackerFilter::fromRequest($request)));
    }

    /** Visits, one row each, newest first - optionally only those that ended one way. */
    public function sessions(Request $request): JsonResponse
    {
        $data = $request->validate([
            'limit'   => ['sometimes', 'integer', 'between:1,200'],
            'offset'  => ['sometimes', 'integer', 'min:0'],
            'outcome' => ['sometimes', 'nullable', 'in:' . implode(',', AnalyticsService::OUTCOMES)],
        ]);

        return $this->json($this->analytics->sessions(
            TrackerFilter::fromRequest($request),
            $data['outcome'] ?? null,
            (int) ($data['limit'] ?? 50),
            (int) ($data['offset'] ?? 0),
        ));
    }

    /**
     * One visit's footprint, in order, with the order it produced.
     *
     * The {session} is an opaque random id minted in the browser, not a
     * database key: there is nothing to enumerate towards, and it identifies a
     * visit rather than a person.
     */
    public function footprint(string $session): JsonResponse
    {
        return $this->json($this->analytics->footprint(mb_substr($session, 0, 64)));
    }

    /**
     * The raw events of the slice, as CSV.
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
        $f     = TrackerFilter::fromRequest($request);
        $slice = $f->toArray();
        $name  = sprintf('gulfrabit-events-%s-to-%s.csv', $slice['from'], $slice['to']);

        return response()->streamDownload(function () use ($f): void {
            $out = fopen('php://output', 'wb');

            // A BOM, so Excel opens Bengali content and the taka sign as UTF-8
            // instead of mojibake. Without it every product name in this file
            // is unreadable in the tool most merchants will open it with.
            fwrite($out, "\xEF\xBB\xBF");

            fputcsv($out, [
                'timestamp', 'event', 'visitor_id', 'session_id', 'path',
                'value_taka', 'currency', 'content_name', 'product_id', 'num_items',
                'search_term', 'search_results',
                'channel', 'landing_path', 'visit_type', 'device', 'os', 'browser', 'referrer_host',
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                'referrer', 'capi_status', 'event_id',
            ]);

            $f->events()
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
                            $e->product_id,
                            $e->num_items,
                            $e->search_term,
                            $e->search_results,
                            $e->channel,
                            $e->landing_path,
                            $e->visit_type,
                            $e->device,
                            $e->os,
                            $e->browser,
                            $e->referrer_host,
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

    private function json(array $data): JsonResponse
    {
        return response()->json(['data' => $data]);
    }
}
