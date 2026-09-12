<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Modules\Marketing\Models\TrackingEvent;

/**
 * The Tracking screen's headline half: the numbers, the chart, the funnel,
 * who is on the shop right now, and any one visit step by step.
 *
 * The breakdowns - channels, devices, products, searches, checkout - live in
 * TrackerReports; what the numbers mean in words lives in InsightEngine. All
 * three read the same TrackerFilter, so every panel is about the same visits.
 *
 * WHY THE COUNTS ARE VISITS, NOT EVENTS
 * ------------------------------------
 * The single most important decision here. A shopper who opens eight product
 * pages fires eight ViewContent events; counted raw, that one person makes the
 * "opened a product" step look eight times healthier than it is, and a funnel
 * whose middle is inflated tells the merchant to fix the wrong screen. Every
 * stage and every rate is therefore DISTINCT VISITS.
 *
 * A LOWER BOUND, HONESTLY
 * -----------------------
 * Visitors are localStorage ids: a cleared browser or a second device is a
 * second visitor, and ad blockers stop some events entirely. These numbers are
 * a floor, not a census, and the screen says so.
 */
final class AnalyticsService
{
    /** A visitor counts as "on the shop now" for this long after their last action. */
    public const ACTIVE_MINUTES = 5;

    public function __construct(private readonly OrderOutcomes $outcomes)
    {
    }

    /* ---- Overview -------------------------------------------------------- */

    /** The headline numbers against the comparison period, the chart and the funnel. */
    public function overview(TrackerFilter $f): array
    {
        $cur  = $this->totals($f, false);
        $prev = $this->totals($f, true);

        return [
            'filter'   => $f->toArray(),
            'labels'   => self::labels(),
            'options'  => $this->options($f),
            'kpis'     => $this->kpis($cur, $prev),
            'series'   => $this->series($f),
            'funnel'   => $this->funnel($f),
            'topPages' => $this->topPages($f),
            'channels' => $this->channelMix($f),
            'capi'     => $this->capi($f),
            'health'   => $this->health(),
            'events'   => (int) $f->events()->count(),
        ];
    }

    /**
     * The overview without its chart, pages and dropdown options - what the
     * insight engine reads. A separate method so the insights request does
     * not pay for a chart nobody will draw from it.
     */
    public function headline(TrackerFilter $f): array
    {
        return [
            'kpis'   => $this->kpis($this->totals($f, false), $this->totals($f, true)),
            'funnel' => $this->funnel($f),
            'capi'   => $this->capi($f),
            'health' => $this->health(),
        ];
    }

    /**
     * Every word the screen puts beside a key. Shipped with the data so the
     * browser never keeps a second copy that drifts from this one.
     */
    public static function labels(): array
    {
        return [
            'channels' => TrafficClassifier::CHANNELS,
            'devices'  => TrafficClassifier::DEVICES,
            'os'       => TrafficClassifier::OS,
            'browsers' => TrafficClassifier::BROWSERS,
            'inApp'    => TrafficClassifier::IN_APP,
            'periods'  => TrackerFilter::PERIODS,
        ];
    }

    /**
     * Visit-level totals for one period.
     *
     * Read off the per-visit facts rather than the raw events, so "left after
     * one page", "reached checkout" and "ordered" are all counted the same
     * way: once per visit.
     */
    private function totals(TrackerFilter $f, bool $previous): object
    {
        $row = DB::query()
            ->fromSub($f->sessionFacts($previous), 's')
            ->selectRaw(implode(', ', [
                'COUNT(*) as sessions',
                'COUNT(DISTINCT visitor_id) as visitors',
                "COUNT(DISTINCT CASE WHEN visit_type = 'new' THEN visitor_id END) as new_visitors",
                'SUM(purchased) as converted',
                'SUM(purchases) as orders',
                'SUM(revenue_poisha) as revenue_poisha',
                'SUM(CASE WHEN pages <= 1 AND actions = 0 THEN 1 ELSE 0 END) as bounced',
                'SUM(pages) as pages',
                'SUM(carted) as carted',
                'SUM(checkout) as checkouts',
                'SUM(CASE WHEN checkout = 1 AND purchased = 0 THEN 1 ELSE 0 END) as abandoned',
                'SUM(CASE WHEN checkout = 1 AND purchased = 0 THEN COALESCE(checkout_poisha, 0) ELSE 0 END) as abandoned_poisha',
                'SUM(CASE WHEN events > 1 THEN TIMESTAMPDIFF(SECOND, started_at, ended_at) ELSE 0 END) as engaged_seconds',
                'SUM(CASE WHEN events > 1 THEN 1 ELSE 0 END) as engaged',
            ]))
            ->first();

        $n = static fn (string $k): int => (int) ($row->{$k} ?? 0);

        return (object) [
            'sessions'        => $n('sessions'),
            'visitors'        => $n('visitors'),
            'newVisitors'     => $n('new_visitors'),
            'converted'       => $n('converted'),
            'orders'          => $n('orders'),
            'revenuePoisha'   => $n('revenue_poisha'),
            'bounced'         => $n('bounced'),
            'pages'           => $n('pages'),
            'carted'          => $n('carted'),
            'checkouts'       => $n('checkouts'),
            'abandoned'       => $n('abandoned'),
            'abandonedPoisha' => $n('abandoned_poisha'),
            'engagedSeconds'  => $n('engaged_seconds'),
            'engaged'         => $n('engaged'),
        ];
    }

    /**
     * The headline tiles, each as {value, prev}. Rates are null - not zero -
     * when there was nothing to divide by: "no visits" is not "0% converted".
     */
    private function kpis(object $c, object $p): array
    {
        $pair = static fn ($now, $before): array => ['value' => $now, 'prev' => $before];
        $pct  = static fn (int $a, int $b): ?float => $b > 0 ? round($a / $b * 100, 2) : null;
        $avg  = static fn (int $a, int $b, int $dp = 0): ?float => $b > 0 ? round($a / $b, $dp) : null;

        return [
            'visitors'      => $pair($c->visitors, $p->visitors),
            'newVisitors'   => $pair($c->newVisitors, $p->newVisitors),
            'sessions'      => $pair($c->sessions, $p->sessions),
            'orders'        => $pair($c->orders, $p->orders),
            'revenueTaka'   => $pair(intdiv($c->revenuePoisha, 100), intdiv($p->revenuePoisha, 100)),
            'conversionPct' => $pair($pct($c->converted, $c->sessions), $pct($p->converted, $p->sessions)),
            'aovTaka'       => $pair($avg(intdiv($c->revenuePoisha, 100), $c->orders), $avg(intdiv($p->revenuePoisha, 100), $p->orders)),
            'bouncePct'     => $pair($pct($c->bounced, $c->sessions), $pct($p->bounced, $p->sessions)),
            'pagesPerVisit' => $pair($avg($c->pages, $c->sessions, 1), $avg($p->pages, $p->sessions, 1)),
            'avgSeconds'    => $pair($avg($c->engagedSeconds, $c->engaged), $avg($p->engagedSeconds, $p->engaged)),
            'cartPct'       => $pair($pct($c->carted, $c->sessions), $pct($p->carted, $p->sessions)),
            'abandoned'     => $pair($c->abandoned, $p->abandoned),
            'abandonedTaka' => $pair(intdiv($c->abandonedPoisha, 100), intdiv($p->abandonedPoisha, 100)),
        ];
    }

    /**
     * Visits, visitors, orders and revenue per hour or day, with the matching
     * point of the comparison period beside each one.
     *
     * Hours when the window is two days or less - a single day drawn as one
     * bar says nothing; drawn as 24 it says when people shop.
     */
    private function series(TrackerFilter $f): array
    {
        $cur  = $this->bucketRows($f, $f->start, $f->end);
        $prev = $this->bucketRows($f, $f->prevStart, $f->prevSpanEnd());

        $now      = CarbonImmutable::now();
        $curKeys  = $f->buckets(false);
        $prevKeys = $f->buckets(true);
        $points   = [];

        foreach ($curKeys as $i => $b) {
            // A bucket that has not started yet is null, not zero - drawn as
            // nothing rather than as a dive to the axis at 3 pm.
            $future = $b['at']->greaterThan($now);
            $row    = $cur[$b['key']] ?? null;
            $pk     = $prevKeys[$i]['key'] ?? null;
            $pRow   = $pk !== null ? ($prev[$pk] ?? null) : null;

            $points[] = [
                't'           => $b['key'],
                'sessions'    => $future ? null : (int) ($row->sessions ?? 0),
                'visitors'    => $future ? null : (int) ($row->visitors ?? 0),
                'orders'      => $future ? null : (int) ($row->orders ?? 0),
                'revenueTaka' => $future ? null : intdiv((int) ($row->revenue_poisha ?? 0), 100),
                'prev'        => $pk === null ? null : [
                    't'           => $pk,
                    'sessions'    => (int) ($pRow->sessions ?? 0),
                    'visitors'    => (int) ($pRow->visitors ?? 0),
                    'orders'      => (int) ($pRow->orders ?? 0),
                    'revenueTaka' => intdiv((int) ($pRow->revenue_poisha ?? 0), 100),
                ],
            ];
        }

        return ['bucket' => $f->bucket, 'points' => $points];
    }

    /** @return array<string, object> keyed by bucket */
    private function bucketRows(TrackerFilter $f, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $expr = $f->bucketExpression();

        return $f->between($from, $to)
            ->toBase()
            ->selectRaw($expr . ' as bucket')
            ->selectRaw('COUNT(DISTINCT session_id) as sessions')
            ->selectRaw('COUNT(DISTINCT visitor_id) as visitors')
            ->selectRaw("SUM(CASE WHEN event_name = 'Purchase' THEN 1 ELSE 0 END) as orders")
            ->selectRaw("SUM(CASE WHEN event_name = 'Purchase' THEN COALESCE(value_poisha, 0) ELSE 0 END) as revenue_poisha")
            ->groupBy(DB::raw($expr))
            ->get()
            ->keyBy(fn ($r): string => (string) $r->bucket)
            ->all();
    }

    /**
     * Visits reaching each step, the share lost at each, and the same count
     * for the comparison period.
     *
     * Drop-off is against the PREVIOUS step, so one bad screen shows as one bad
     * number instead of dragging every row beneath it down with it. It is null
     * for the first step and wherever the step before saw nobody - "no one got
     * here to drop out" is a different fact from "everybody dropped out".
     *
     * A step can see MORE visits than the one above it: express checkout goes
     * from a product straight to checkout without a cart. The browser shows
     * that as people skipping the step rather than as a negative loss.
     */
    private function funnel(TrackerFilter $f): array
    {
        $cur  = $this->stageCounts($f, false);
        $prev = $this->stageCounts($f, true);

        $rows     = [];
        $previous = null;

        foreach (TrackingEvent::FUNNEL as $stage) {
            $count = (int) ($cur[$stage] ?? 0);

            $rows[] = [
                'stage'        => $stage,
                'sessions'     => $count,
                'prevSessions' => (int) ($prev[$stage] ?? 0),
                'dropOffPct'   => ($previous === null || $previous === 0)
                    ? null
                    : (int) round((1 - $count / $previous) * 100),
                'ofTopPct'     => null,
            ];
            $previous = $count;
        }

        $top = $rows[0]['sessions'] ?? 0;
        foreach ($rows as $i => $row) {
            $rows[$i]['ofTopPct'] = $top > 0 ? round($row['sessions'] / $top * 100, 1) : null;
        }

        return $rows;
    }

    /** @return array<string, int> visits per funnel event */
    private function stageCounts(TrackerFilter $f, bool $previous): array
    {
        return $f->events($previous)
            ->toBase()
            ->whereIn('event_name', TrackingEvent::FUNNEL)
            ->groupBy('event_name')
            ->selectRaw('event_name, COUNT(DISTINCT session_id) as sessions')
            ->get()
            ->mapWithKeys(fn ($r): array => [(string) $r->event_name => (int) $r->sessions])
            ->all();
    }

    /** Where people actually went, ranked by visits - one person refreshing is not a popular page. */
    private function topPages(TrackerFilter $f, int $limit = 10): array
    {
        return $f->events()
            ->toBase()
            ->whereNotNull('path')
            ->groupBy('path')
            ->selectRaw('path')
            ->selectRaw('COUNT(DISTINCT session_id) as sessions')
            ->selectRaw("SUM(CASE WHEN event_name = 'PageView' THEN 1 ELSE 0 END) as views")
            ->orderByDesc('sessions')
            ->limit($limit)
            ->get()
            ->map(fn ($r): array => [
                'path'     => (string) $r->path,
                'sessions' => (int) $r->sessions,
                'views'    => (int) $r->views,
            ])
            ->all();
    }

    /** The overview's channel strip: visits and orders per channel. */
    private function channelMix(TrackerFilter $f, int $limit = 8): array
    {
        return DB::query()
            ->fromSub($f->sessionFacts(), 's')
            ->groupBy('channel')
            ->selectRaw('channel')
            ->selectRaw('COUNT(*) as sessions')
            ->selectRaw('SUM(purchased) as converted')
            ->selectRaw('SUM(revenue_poisha) as revenue_poisha')
            ->orderByDesc('sessions')
            ->limit($limit)
            ->get()
            ->map(fn ($r): array => [
                'channel'     => $r->channel ?? 'unknown',
                'sessions'    => (int) $r->sessions,
                'converted'   => (int) $r->converted,
                'revenueTaka' => intdiv((int) $r->revenue_poisha, 100),
            ])
            ->all();
    }

    /**
     * Whether the server copy is reaching Meta. Skipped (no token - the
     * shipped state, not a fault) is kept apart from failed (Meta refused), or
     * a merchant cannot tell a setting they have not made from a thing broken.
     */
    private function capi(TrackerFilter $f): array
    {
        $rows = $f->events()
            ->toBase()
            ->groupBy('capi_status')
            ->selectRaw('capi_status, COUNT(*) as n')
            ->get()
            ->mapWithKeys(fn ($r): array => [(string) $r->capi_status => (int) $r->n]);

        return [
            'sent'    => (int) ($rows['sent'] ?? 0),
            'failed'  => (int) ($rows['failed'] ?? 0),
            'skipped' => (int) ($rows['skipped'] ?? 0),
        ];
    }

    /**
     * Is the tracking itself alive? Deliberately NOT filtered: a segment with
     * no traffic must not read as "the pixel is down".
     */
    private function health(): array
    {
        $last  = TrackingEvent::query()->max('created_at');
        $since = CarbonImmutable::now()->subDay();

        $byEvent = TrackingEvent::query()
            ->toBase()
            ->where('created_at', '>=', $since)
            ->groupBy('event_name')
            ->selectRaw('event_name, COUNT(*) as n')
            ->get()
            ->mapWithKeys(fn ($r): array => [(string) $r->event_name => (int) $r->n])
            ->all();

        $capi = TrackingEvent::query()
            ->toBase()
            ->where('created_at', '>=', $since)
            ->groupBy('capi_status')
            ->selectRaw('capi_status, COUNT(*) as n')
            ->get()
            ->mapWithKeys(fn ($r): array => [(string) $r->capi_status => (int) $r->n])
            ->all();

        $lastAt = $last ? CarbonImmutable::parse((string) $last) : null;

        return [
            'lastEventAt'         => $lastAt?->toDateTimeString(),
            'lastEventAgoSeconds' => $lastAt ? max(0, CarbonImmutable::now()->getTimestamp() - $lastAt->getTimestamp()) : null,
            'events24h'           => array_sum($byEvent),
            'byEvent24h'          => $byEvent,
            'capi24h'             => [
                'sent'    => (int) ($capi['sent'] ?? 0),
                'failed'  => (int) ($capi['failed'] ?? 0),
                'skipped' => (int) ($capi['skipped'] ?? 0),
            ],
        ];
    }

    /**
     * What the filter dropdowns offer: every campaign seen in the last 90 days
     * and every channel seen in the period. NOT narrowed by the current
     * segment - choosing one campaign must not make the others disappear from
     * the list you would choose the next one from.
     */
    private function options(TrackerFilter $f): array
    {
        $campaigns = TrackingEvent::query()
            ->toBase()
            ->where('created_at', '>=', CarbonImmutable::now()->subDays(90))
            ->whereNotNull('utm_campaign')
            ->groupBy('utm_campaign')
            ->selectRaw('utm_campaign, COUNT(DISTINCT session_id) as sessions')
            ->orderByDesc('sessions')
            ->limit(60)
            // get() first: pluck() on the builder replaces the select list, and
            // the ORDER BY above names a column that would no longer exist.
            ->get()
            ->map(fn ($r): string => (string) $r->utm_campaign)
            ->all();

        $channels = TrackingEvent::query()
            ->toBase()
            ->where('created_at', '>=', $f->start)
            ->where('created_at', '<', $f->end)
            ->whereNotNull('channel')
            ->distinct()
            ->pluck('channel')
            ->map(fn ($c): string => (string) $c)
            ->all();

        return ['campaigns' => $campaigns, 'channels' => $channels];
    }

    /* ---- Live ------------------------------------------------------------ */

    /**
     * Who is on the shop right now, what they are looking at, and the last
     * hour's events as they arrived.
     *
     * "Now" is the last five minutes - the storefront sends no heartbeat, so a
     * visitor reading one page for ten minutes has, as far as the server can
     * tell, left. Five is short enough to mean "now" and long enough that a
     * shopper comparing two products does not flicker out between them.
     *
     * The period filter does not apply - now is now - but the segment does,
     * so "Meta ads, phones" shows only those visitors.
     */
    public function live(TrackerFilter $f): array
    {
        $now    = CarbonImmutable::now();
        $active = $now->subMinutes(self::ACTIVE_MINUTES);

        $sessions = $f->between($now->subHours(3), $now->addMinute())
            ->toBase()
            ->whereNotNull('session_id')
            ->groupBy('session_id')
            ->havingRaw('MAX(created_at) >= ?', [$active->toDateTimeString()])
            ->select([
                'session_id',
                DB::raw('MAX(channel) as channel'),
                DB::raw('MAX(device) as device'),
                DB::raw('MAX(os) as os'),
                DB::raw('MAX(browser) as browser'),
                DB::raw('MAX(visit_type) as visit_type'),
                DB::raw('MAX(landing_path) as landing_path'),
                DB::raw('MAX(utm_campaign) as utm_campaign'),
                DB::raw('MIN(created_at) as started_at'),
                DB::raw('MAX(created_at) as last_at'),
                DB::raw('MAX(id) as last_id'),
                DB::raw('COUNT(DISTINCT path) as pages'),
                DB::raw("MAX(CASE WHEN event_name = 'ViewContent' THEN 1 ELSE 0 END) as viewed"),
                DB::raw("MAX(CASE WHEN event_name = 'AddToCart' THEN 1 ELSE 0 END) as carted"),
                DB::raw("MAX(CASE WHEN event_name = 'InitiateCheckout' THEN 1 ELSE 0 END) as checkout"),
                DB::raw("MAX(CASE WHEN event_name = 'Purchase' THEN 1 ELSE 0 END) as purchased"),
                DB::raw("MAX(CASE WHEN event_name IN ('AddToCart', 'InitiateCheckout') THEN value_poisha ELSE NULL END) as cart_poisha"),
            ])
            ->orderByDesc(DB::raw('MAX(created_at)'))
            ->get();

        $last = TrackingEvent::query()
            ->whereIn('id', $sessions->pluck('last_id')->all())
            ->get(['id', 'event_name', 'path', 'content_name', 'search_term'])
            ->keyBy('id');

        $visitors = $sessions->take(60)->map(function ($s) use ($last, $now): array {
            $e = $last[$s->last_id] ?? null;

            return [
                'session_id'    => (string) $s->session_id,
                'channel'       => $s->channel,
                'device'        => $s->device,
                'os'            => $s->os,
                'browser'       => $s->browser,
                'visit_type'    => $s->visit_type,
                'landing_path'  => $s->landing_path,
                'campaign'      => $s->utm_campaign,
                'current_path'  => $e?->path,
                'current_title' => $e?->content_name ?? ($e?->search_term !== null ? '“' . $e->search_term . '”' : null),
                'last_event'    => $e?->event_name,
                'pages'         => (int) $s->pages,
                'seconds'       => max(0, CarbonImmutable::parse((string) $s->last_at)->getTimestamp() - CarbonImmutable::parse((string) $s->started_at)->getTimestamp()),
                'idleSeconds'   => max(0, $now->getTimestamp() - CarbonImmutable::parse((string) $s->last_at)->getTimestamp()),
                'stage'         => self::stage($s),
                'cartTaka'      => $s->cart_poisha !== null ? intdiv((int) $s->cart_poisha, 100) : null,
            ];
        })->values()->all();

        return [
            'now'           => $now->toDateTimeString(),
            'activeMinutes' => self::ACTIVE_MINUTES,
            'active'        => $sessions->count(),
            'inCheckout'    => $sessions->filter(fn ($s): bool => (int) $s->checkout === 1 && (int) $s->purchased === 0)->count(),
            'withCart'      => $sessions->filter(fn ($s): bool => (int) $s->carted === 1 && (int) $s->checkout === 0)->count(),
            'ordered'       => $sessions->filter(fn ($s): bool => (int) $s->purchased === 1)->count(),
            'perMinute'     => $this->perMinute($f, $now),
            'visitors'      => $visitors,
            'feed'          => $this->feed($f, $now),
            'today'         => $this->today($f, $now),
            'labels'        => self::labels(),
        ];
    }

    /** How far a visit has got, as one word. Read from the deepest step down. */
    public static function stage(object $s): string
    {
        return match (true) {
            (int) ($s->purchased ?? 0) === 1 => 'ordered',
            (int) ($s->checkout ?? 0) === 1  => 'checkout',
            (int) ($s->carted ?? 0) === 1    => 'cart',
            (int) ($s->viewed ?? 0) === 1    => 'product',
            default                          => 'browsing',
        };
    }

    /** Visits active in each of the last 30 minutes, oldest first, gaps as zero. */
    private function perMinute(TrackerFilter $f, CarbonImmutable $now): array
    {
        $from = $now->subMinutes(29)->startOfMinute();
        $expr = "DATE_FORMAT(created_at, '%Y-%m-%d %H:%i')";

        $rows = $f->between($from, $now->addMinute())
            ->toBase()
            ->selectRaw($expr . ' as m')
            ->selectRaw('COUNT(DISTINCT session_id) as sessions')
            ->selectRaw('COUNT(*) as events')
            ->groupBy(DB::raw($expr))
            ->get()
            ->keyBy(fn ($r): string => (string) $r->m);

        $out = [];
        for ($i = 0; $i < 30; $i++) {
            $at    = $from->addMinutes($i);
            $row   = $rows[$at->format('Y-m-d H:i')] ?? null;
            $out[] = [
                't'        => $at->format('H:i'),
                'sessions' => (int) ($row->sessions ?? 0),
                'events'   => (int) ($row->events ?? 0),
            ];
        }

        return $out;
    }

    /** The last hour's events, newest first - the live feed. */
    private function feed(TrackerFilter $f, CarbonImmutable $now, int $limit = 40): array
    {
        return $f->between($now->subHour(), $now->addMinute())
            ->orderByDesc('id')
            ->limit($limit)
            ->get(['id', 'event_name', 'path', 'content_name', 'value_poisha', 'search_term',
                   'search_results', 'channel', 'device', 'browser', 'session_id', 'created_at'])
            ->map(fn (TrackingEvent $e): array => [
                'id'            => $e->id,
                'event_name'    => $e->event_name,
                'path'          => $e->path,
                'content_name'  => $e->content_name,
                'valueTaka'     => $e->valueTaka() !== null ? (int) round($e->valueTaka()) : null,
                'search_term'   => $e->search_term,
                'searchResults' => $e->search_results,
                'channel'       => $e->channel,
                'device'        => $e->device,
                'browser'       => $e->browser,
                'session_id'    => $e->session_id,
                'at'            => $e->created_at?->toDateTimeString(),
                'agoSeconds'    => $e->created_at ? max(0, $now->getTimestamp() - $e->created_at->getTimestamp()) : null,
            ])
            ->all();
    }

    /** Today so far, for the strip above the live view. */
    private function today(TrackerFilter $f, CarbonImmutable $now): array
    {
        $row = $f->between($now->startOfDay(), $now->addMinute())
            ->toBase()
            ->selectRaw('COUNT(DISTINCT session_id) as sessions')
            ->selectRaw("SUM(CASE WHEN event_name = 'Purchase' THEN 1 ELSE 0 END) as orders")
            ->selectRaw("SUM(CASE WHEN event_name = 'Purchase' THEN COALESCE(value_poisha, 0) ELSE 0 END) as revenue_poisha")
            ->first();

        return [
            'sessions'    => (int) ($row->sessions ?? 0),
            'orders'      => (int) ($row->orders ?? 0),
            'revenueTaka' => intdiv((int) ($row->revenue_poisha ?? 0), 100),
        ];
    }

    /* ---- Visits ---------------------------------------------------------- */

    /** Outcomes the visit list can be narrowed to, in the words the screen uses. */
    public const OUTCOMES = ['ordered', 'checkout', 'cart', 'browsed', 'bounced'];

    /**
     * Visits in the slice, newest first, one row each - optionally only those
     * that ended one way.
     */
    public function sessions(TrackerFilter $f, ?string $outcome, int $limit, int $offset): array
    {
        $q = DB::query()->fromSub($f->sessionFacts(), 's');

        match ($outcome) {
            'ordered'  => $q->where('purchased', 1),
            'checkout' => $q->where('checkout', 1)->where('purchased', 0),
            'cart'     => $q->where('carted', 1)->where('checkout', 0)->where('purchased', 0),
            'browsed'  => $q->where('carted', 0)->where('checkout', 0)->where('purchased', 0),
            'bounced'  => $q->where('pages', '<=', 1)->where('actions', 0),
            default    => null,
        };

        return $q->orderByDesc('ended_at')
            ->limit($limit)
            ->offset($offset)
            ->get()
            ->map(fn ($s): array => [
                'session_id'   => (string) $s->session_id,
                'started_at'   => (string) $s->started_at,
                'ended_at'     => (string) $s->ended_at,
                'seconds'      => max(0, CarbonImmutable::parse((string) $s->ended_at)->getTimestamp() - CarbonImmutable::parse((string) $s->started_at)->getTimestamp()),
                'channel'      => $s->channel,
                'device'       => $s->device,
                'browser'      => $s->browser,
                'os'           => $s->os,
                'visit_type'   => $s->visit_type,
                'landing_path' => $s->landing_path,
                'utm_campaign' => $s->utm_campaign,
                'pages'        => (int) $s->pages,
                'events'       => (int) $s->events,
                'stage'        => self::stage($s),
                'revenueTaka'  => intdiv((int) $s->revenue_poisha, 100),
                'checkoutTaka' => $s->checkout_poisha !== null ? intdiv((int) $s->checkout_poisha, 100) : null,
            ])
            ->all();
    }

    /**
     * One visit, step by step - and, when it ended in an order, the order,
     * with what happened to it since.
     */
    public function footprint(string $sessionId): array
    {
        $events = TrackingEvent::query()
            ->where('session_id', $sessionId)
            ->orderBy('created_at')
            ->orderBy('id')
            ->limit(500)
            ->get(['id', 'event_id', 'event_name', 'path', 'content_name', 'value_poisha', 'currency',
                   'referrer', 'referrer_host', 'search_term', 'search_results', 'num_items',
                   'channel', 'device', 'os', 'browser', 'landing_path', 'visit_type',
                   'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'capi_status', 'created_at']);

        $first = $events->first();
        $lastE = $events->last();

        $orders = $this->outcomes->byEventId(
            $events->where('event_name', 'Purchase')->pluck('event_id')->filter()->values()->all(),
        );

        return [
            'session' => $first === null ? null : [
                'session_id'    => $sessionId,
                'channel'       => $first->channel,
                'device'        => $first->device,
                'os'            => $first->os,
                'browser'       => $first->browser,
                'visit_type'    => $first->visit_type,
                'landing_path'  => $first->landing_path ?? $first->path,
                'referrer_host' => $events->pluck('referrer_host')->filter()->first(),
                'utm_source'    => $first->utm_source,
                'utm_medium'    => $first->utm_medium,
                'utm_campaign'  => $first->utm_campaign,
                'utm_content'   => $first->utm_content,
                'started_at'    => $first->created_at?->toDateTimeString(),
                'ended_at'      => $lastE?->created_at?->toDateTimeString(),
                'seconds'       => ($first->created_at && $lastE?->created_at)
                    ? max(0, $lastE->created_at->getTimestamp() - $first->created_at->getTimestamp())
                    : 0,
                'pages'         => $events->pluck('path')->filter()->unique()->count(),
            ],
            'events' => $events->map(fn (TrackingEvent $e): array => [
                'id'            => $e->id,
                'event_name'    => $e->event_name,
                'path'          => $e->path,
                'content_name'  => $e->content_name,
                'valueTaka'     => $e->valueTaka() !== null ? (int) round($e->valueTaka()) : null,
                'search_term'   => $e->search_term,
                'searchResults' => $e->search_results,
                'num_items'     => $e->num_items,
                'capi_status'   => $e->capi_status,
                'at'            => $e->created_at?->toDateTimeString(),
                'order'         => $e->event_name === 'Purchase' && $e->event_id !== null && isset($orders[$e->event_id])
                    ? $orders[$e->event_id]->order_number
                    : null,
            ])->all(),
            'orders' => array_values(array_map(fn ($o): array => [
                'orderNumber'   => $o->order_number,
                'status'        => $o->status,
                'outcome'       => OrderOutcomes::bucket($o->status),
                'totalTaka'     => intdiv((int) $o->total_poisha, 100),
                'district'      => $o->district_name,
                'paymentMethod' => $o->payment_method,
                'placedAt'      => $o->created_at?->toDateTimeString(),
            ], $orders)),
        ];
    }
}
