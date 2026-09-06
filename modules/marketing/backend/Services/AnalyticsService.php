<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Marketing\Models\TrackingEvent;

/**
 * The shop's own funnel, computed from its own events.
 *
 * WHY THE COUNTS ARE SESSIONS, NOT EVENTS
 * ---------------------------------------
 * The single most important decision in this file. A shopper who opens eight
 * product pages fires eight ViewContent events; counted raw, that one person
 * makes the ViewContent step look eight times healthier than it is, and a
 * funnel whose middle is inflated tells the merchant to fix the wrong screen.
 *
 * Every stage is therefore DISTINCT SESSIONS that reached it. "How many visits
 * got this far" is the question a drop-off rate is actually asking, and it is
 * the only counting that makes the percentages between stages mean anything.
 *
 * WHY DROP-OFF IS AGAINST THE PREVIOUS STAGE
 * ------------------------------------------
 * Each rate divides by the step before it, not by the top. Divided by the top,
 * every number below ViewContent reads like a catastrophe and they all move
 * together, so nothing stands out. Against the previous step, one bad screen
 * shows up as one bad number - which is the whole point of looking.
 *
 * A LOWER BOUND, HONESTLY
 * -----------------------
 * Sessions come from localStorage ids, so a cleared browser or a second device
 * is a second visitor. Ad blockers stop some events entirely. These numbers are
 * a floor, not a census, and the dashboard says so rather than implying a
 * precision it does not have.
 */
class AnalyticsService
{
    /** The headline numbers, the funnel, and what people looked at. */
    public function summary(int $days): array
    {
        $base = TrackingEvent::query()->inWindow($days);

        $totals = (clone $base)
            ->selectRaw('COUNT(*) as events')
            ->selectRaw('COUNT(DISTINCT visitor_id) as visitors')
            ->selectRaw('COUNT(DISTINCT session_id) as sessions')
            ->first();

        // Sessions per stage, in one pass rather than five queries.
        $perStage = (clone $base)
            ->whereIn('event_name', TrackingEvent::FUNNEL)
            ->groupBy('event_name')
            ->pluck(DB::raw('COUNT(DISTINCT session_id)'), 'event_name');

        $funnel = [];
        $previous = null;
        foreach (TrackingEvent::FUNNEL as $stage) {
            $count = (int) ($perStage[$stage] ?? 0);

            $funnel[] = [
                'stage'    => $stage,
                'sessions' => $count,
                // Null, not zero, for the first stage and for any stage whose
                // predecessor saw nobody: "no one got here to drop out" is not
                // the same fact as "everybody dropped out", and a 100% shown
                // for the former sends the merchant chasing a screen that is
                // working fine.
                'dropOffPct' => ($previous === null || $previous === 0)
                    ? null
                    : (int) round((1 - $count / $previous) * 100),
                'ofTopPct' => null,   // filled below, once the top is known
            ];
            $previous = $count;
        }

        $top = $funnel[0]['sessions'] ?? 0;
        foreach ($funnel as $i => $row) {
            $funnel[$i]['ofTopPct'] = $top > 0 ? (int) round($row['sessions'] / $top * 100) : null;
        }

        return [
            'days'     => $days,
            'events'   => (int) ($totals->events ?? 0),
            'visitors' => (int) ($totals->visitors ?? 0),
            'sessions' => (int) ($totals->sessions ?? 0),
            'revenueTaka' => (int) round(
                (clone $base)->where('event_name', 'Purchase')->sum('value_poisha') / 100
            ),
            'purchases' => (clone $base)->where('event_name', 'Purchase')->count(),
            'funnel'    => $funnel,
            'topPages'  => $this->topPages($days),
            'campaigns' => $this->campaigns($days),
            'capi'      => $this->capiHealth($days),
        ];
    }

    /**
     * Where people actually went.
     *
     * Ranked by SESSIONS, not hits, for the same reason the funnel is: one
     * person refreshing a page is not a popular page.
     */
    private function topPages(int $days, int $limit = 12): Collection
    {
        return TrackingEvent::query()
            ->inWindow($days)
            ->whereNotNull('path')
            ->groupBy('path')
            ->orderByDesc(DB::raw('COUNT(DISTINCT session_id)'))
            ->limit($limit)
            ->get([
                'path',
                DB::raw('COUNT(DISTINCT session_id) as sessions'),
                DB::raw('COUNT(*) as views'),
            ]);
    }

    /**
     * Which ad brought them, from the FIRST-touch utm captured on landing.
     *
     * '(direct)' rather than null in the label: a blank row in a report reads
     * as a bug, and "nobody paid for these" is a real and useful category -
     * it is the organic baseline every paid number should be judged against.
     */
    private function campaigns(int $days, int $limit = 10): Collection
    {
        return TrackingEvent::query()
            ->inWindow($days)
            ->groupBy('utm_campaign', 'utm_source')
            ->orderByDesc(DB::raw('COUNT(DISTINCT session_id)'))
            ->limit($limit)
            ->get([
                'utm_campaign',
                'utm_source',
                DB::raw('COUNT(DISTINCT session_id) as sessions'),
                DB::raw("SUM(CASE WHEN event_name = 'Purchase' THEN 1 ELSE 0 END) as purchases"),
                DB::raw("SUM(CASE WHEN event_name = 'Purchase' THEN value_poisha ELSE 0 END) as revenue_poisha"),
            ]);
    }

    /**
     * Whether the server copy is reaching Meta.
     *
     * Three states kept apart on purpose: skipped means no token is configured
     * (the shipped state, not a fault), failed means Meta refused or was
     * unreachable. Collapsed into one "not sent" number, a merchant cannot tell
     * a setting they have not made from a thing that is broken.
     */
    private function capiHealth(int $days): array
    {
        $rows = TrackingEvent::query()
            ->inWindow($days)
            ->groupBy('capi_status')
            ->pluck(DB::raw('COUNT(*)'), 'capi_status');

        return [
            'sent'    => (int) ($rows['sent'] ?? 0),
            'failed'  => (int) ($rows['failed'] ?? 0),
            'skipped' => (int) ($rows['skipped'] ?? 0),
        ];
    }

    /**
     * Recent visits, newest first, one row each.
     *
     * The outcome column is what makes this worth reading: a list of session
     * ids is noise, but "this visit ended at checkout without buying" is a
     * question worth opening.
     */
    public function sessions(int $days, int $limit, int $offset): Collection
    {
        return TrackingEvent::query()
            ->inWindow($days)
            ->whereNotNull('session_id')
            ->groupBy('session_id')
            ->orderByDesc(DB::raw('MAX(created_at)'))
            ->limit($limit)
            ->offset($offset)
            ->get([
                'session_id',
                DB::raw('MIN(created_at) as started_at'),
                DB::raw('MAX(created_at) as ended_at'),
                DB::raw('COUNT(*) as events'),
                DB::raw('COUNT(DISTINCT path) as pages'),
                DB::raw('MAX(utm_campaign) as utm_campaign'),
                DB::raw('MAX(utm_source) as utm_source'),
                DB::raw("MAX(CASE WHEN event_name = 'Purchase' THEN 1 ELSE 0 END) as purchased"),
                DB::raw("MAX(CASE WHEN event_name = 'InitiateCheckout' THEN 1 ELSE 0 END) as reached_checkout"),
                DB::raw("MAX(CASE WHEN event_name = 'AddToCart' THEN 1 ELSE 0 END) as added_to_cart"),
                DB::raw("SUM(CASE WHEN event_name = 'Purchase' THEN value_poisha ELSE 0 END) as revenue_poisha"),
            ]);
    }

    /** One visit's footprint: every event it fired, in the order it happened. */
    public function footprint(string $sessionId): Collection
    {
        return TrackingEvent::query()
            ->where('session_id', $sessionId)
            ->orderBy('created_at')
            ->limit(500)
            ->get([
                'id', 'event_name', 'path', 'content_name',
                'value_poisha', 'currency', 'referrer', 'capi_status', 'created_at',
            ]);
    }
}
