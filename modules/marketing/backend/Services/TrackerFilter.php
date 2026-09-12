<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Modules\Marketing\Models\TrackingEvent;
use Throwable;

/**
 * The slice of traffic every report on the Tracking screen is about.
 *
 * A period, the period it is compared with, and optionally one channel, one
 * device and one campaign. Built once per request and handed to every report,
 * so the headline numbers, the chart, the funnel and every table underneath
 * are always about the same visits - the one promise a dashboard with a
 * filter row has to keep, and the one that breaks first when each panel
 * reads the query string for itself.
 *
 * THE COMPARISON IS LIKE FOR LIKE
 * -------------------------------
 * "Today" is compared with yesterday UP TO THE SAME TIME, not with all of
 * yesterday: at 11 am a full yesterday always wins, and a screen that says
 * "down 60%" every morning trains its reader to ignore the arrow. Every other
 * preset shifts the whole window back by its own length, so a partial
 * current day is set against the same partial day before it.
 *
 * WINDOWS ARE HALF-OPEN
 * ---------------------
 * Start included, end excluded. An event at exactly midnight belongs to the
 * day it starts,
 * never to both - the boundary two reports eventually disagree about when
 * each writes its own where-clause.
 */
final class TrackerFilter
{
    public const PERIODS = [
        'today'      => 'Today',
        'yesterday'  => 'Yesterday',
        '7d'         => 'Last 7 days',
        '30d'        => 'Last 30 days',
        '90d'        => 'Last 90 days',
        'month'      => 'This month',
        'last_month' => 'Last month',
        'custom'     => 'Custom range',
    ];

    /** A year and a day. Past that a "range" is a full-table scan from a URL. */
    private const MAX_CUSTOM_DAYS = 366;

    private function __construct(
        public readonly string $period,
        public readonly CarbonImmutable $start,
        public readonly CarbonImmutable $end,
        public readonly CarbonImmutable $prevStart,
        public readonly CarbonImmutable $prevEnd,
        public readonly CarbonImmutable $spanEnd,
        public readonly string $bucket,
        public readonly string $compareLabel,
        public readonly ?string $channel,
        public readonly ?string $device,
        public readonly ?string $campaign,
    ) {
    }

    public static function fromRequest(Request $request): self
    {
        $now   = CarbonImmutable::now();
        $today = $now->startOfDay();

        $period = (string) $request->query('period', '');

        // The screen used to send ?days=1|7|30|90, and a bookmark from then
        // should still open on the period it was saved with.
        if ($period === '' && $request->query('days') !== null) {
            $period = match ((int) $request->query('days')) {
                1       => 'today',
                30      => '30d',
                90      => '90d',
                default => '7d',
            };
        }

        $window = match ($period) {
            'today'      => [$today, $now, $today->subDay(), $now->subDay(), 'yesterday by this time'],
            'yesterday'  => [$today->subDay(), $today, $today->subDays(2), $today->subDay(), 'the day before'],
            '30d'        => self::rolling($today, $now, 30),
            '90d'        => self::rolling($today, $now, 90),
            'month'      => [
                $today->startOfMonth(), $now,
                $today->startOfMonth()->subMonthNoOverflow(), $now->subMonthNoOverflow(),
                'last month by this date',
            ],
            'last_month' => [
                $today->startOfMonth()->subMonthNoOverflow(), $today->startOfMonth(),
                $today->startOfMonth()->subMonthsNoOverflow(2), $today->startOfMonth()->subMonthNoOverflow(),
                'the month before',
            ],
            'custom'     => self::custom($request, $today, $now),
            default      => null,
        };

        if ($window === null) {
            $period = '7d';
            $window = self::rolling($today, $now, 7);
        }

        [$start, $end, $prevStart, $prevEnd, $label] = $window;

        // A window that runs to "now" is drawn to the end of today, so the
        // chart shows the day's remaining hours as empty rather than
        // stretching the morning across the whole width.
        $spanEnd = $end->equalTo($end->startOfDay()) ? $end : $end->startOfDay()->addDay();
        $bucket  = $start->diffInHours($spanEnd, true) <= 48 ? 'hour' : 'day';

        $channel = (string) $request->query('channel', '');
        $device  = (string) $request->query('device', '');
        $campaign = trim((string) $request->query('campaign', ''));

        return new self(
            period: $period,
            start: $start,
            end: $end,
            prevStart: $prevStart,
            prevEnd: $prevEnd,
            spanEnd: $spanEnd,
            bucket: $bucket,
            compareLabel: $label,
            channel: array_key_exists($channel, TrafficClassifier::CHANNELS) ? $channel : null,
            device: $device === 'unknown' || array_key_exists($device, TrafficClassifier::DEVICES) ? $device : null,
            campaign: $campaign === '' ? null : mb_substr($campaign, 0, 128),
        );
    }

    /**
     * The last N days including today, against the N days before them.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable, 2: CarbonImmutable, 3: CarbonImmutable, 4: string}
     */
    private static function rolling(CarbonImmutable $today, CarbonImmutable $now, int $days): array
    {
        $start = $today->subDays($days - 1);

        return [$start, $now, $start->subDays($days), $now->subDays($days), "the previous {$days} days"];
    }

    /**
     * ?from=Y-m-d&to=Y-m-d, both inclusive. Null when either is missing or
     * malformed, and the caller falls back to the default.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable, 2: CarbonImmutable, 3: CarbonImmutable, 4: string}|null
     */
    private static function custom(Request $request, CarbonImmutable $today, CarbonImmutable $now): ?array
    {
        $from = self::date((string) $request->query('from', ''));
        $to   = self::date((string) $request->query('to', ''));

        if ($from === null || $to === null) {
            return null;
        }

        if ($to->lessThan($from)) {
            [$from, $to] = [$to, $from];
        }

        // Nothing has happened after today yet.
        if ($to->greaterThan($today)) {
            $to = $today;
        }
        if ($from->greaterThan($to)) {
            $from = $to;
        }

        $endDay = $to->addDay();
        $days   = (int) round($from->diffInDays($endDay, true));

        if ($days > self::MAX_CUSTOM_DAYS) {
            $days = self::MAX_CUSTOM_DAYS;
            $from = $endDay->subDays($days);
        }

        $end = $endDay->greaterThan($now) ? $now : $endDay;

        return [
            $from, $end,
            $from->subDays($days), $end->subDays($days),
            $days === 1 ? 'the day before' : "the previous {$days} days",
        ];
    }

    private static function date(string $value): ?CarbonImmutable
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }

        // Carbon's strict mode throws on a string it cannot read rather than
        // returning false; either way the answer is "no date given".
        try {
            $date = CarbonImmutable::createFromFormat('!Y-m-d', $value);
        } catch (Throwable) {
            return null;
        }

        return $date instanceof CarbonImmutable ? $date : null;
    }

    /* ---- Queries --------------------------------------------------------- */

    /** Events in the period - or the comparison period - inside the segment. */
    public function events(bool $previous = false): Builder
    {
        return $this->between(
            $previous ? $this->prevStart : $this->start,
            $previous ? $this->prevEnd : $this->end,
        );
    }

    /** Events in an arbitrary window, inside the segment. */
    public function between(CarbonImmutable $from, CarbonImmutable $to): Builder
    {
        $q = TrackingEvent::query()
            ->where('created_at', '>=', $from)
            ->where('created_at', '<', $to);

        $this->segment($q);

        return $q;
    }

    /**
     * Narrow any query on tracking_events to the chosen channel, device and
     * campaign. Every one of the three is a column on every event - see
     * VisitContext - so this never needs a join.
     */
    public function segment(Builder|QueryBuilder $q): Builder|QueryBuilder
    {
        if ($this->channel !== null) {
            $q->where('channel', $this->channel);
        }

        if ($this->device === 'unknown') {
            $q->whereNull('device');
        } elseif ($this->device !== null) {
            $q->where('device', $this->device);
        }

        if ($this->campaign === '(none)') {
            $q->whereNull('utm_campaign');
        } elseif ($this->campaign !== null) {
            $q->where('utm_campaign', $this->campaign);
        }

        return $q;
    }

    /**
     * One row per VISIT in the slice: where it came from, what it ran on, how
     * far it got and what it was worth.
     *
     * The single definition of a visit behind every report that counts visits
     * - bounce rate, conversion by channel, abandoned checkouts. Defined once
     * here, because the day two reports each write their own is the day the
     * screen says 41% bounce in one panel and 38% in the next.
     *
     * "Left after one page" is ONE page and nothing done on it: no cart, no
     * search, no wishlist. Landing on a product page fires PageView and
     * ViewContent together, and counting that as two actions would make every
     * product landing look engaged.
     */
    public function sessionFacts(bool $previous = false): QueryBuilder
    {
        return $this->events($previous)
            ->toBase()
            ->whereNotNull('session_id')
            ->groupBy('session_id')
            ->select([
                'session_id',
                DB::raw('MAX(visitor_id) as visitor_id'),
                DB::raw('MAX(channel) as channel'),
                DB::raw('MAX(device) as device'),
                DB::raw('MAX(os) as os'),
                DB::raw('MAX(browser) as browser'),
                DB::raw('MAX(landing_path) as landing_path'),
                DB::raw('MAX(visit_type) as visit_type'),
                DB::raw('MAX(utm_campaign) as utm_campaign'),
                DB::raw('MAX(utm_source) as utm_source'),
                DB::raw('MAX(utm_medium) as utm_medium'),
                DB::raw('MAX(utm_content) as utm_content'),
                DB::raw('MIN(created_at) as started_at'),
                DB::raw('MAX(created_at) as ended_at'),
                DB::raw('MAX(id) as last_id'),
                DB::raw('COUNT(*) as events'),
                DB::raw('COUNT(DISTINCT path) as pages'),
                DB::raw("MAX(CASE WHEN event_name = 'ViewContent' THEN 1 ELSE 0 END) as viewed"),
                DB::raw("MAX(CASE WHEN event_name = 'AddToCart' THEN 1 ELSE 0 END) as carted"),
                DB::raw("MAX(CASE WHEN event_name = 'InitiateCheckout' THEN 1 ELSE 0 END) as checkout"),
                DB::raw("MAX(CASE WHEN event_name = 'Purchase' THEN 1 ELSE 0 END) as purchased"),
                DB::raw("SUM(CASE WHEN event_name = 'Purchase' THEN 1 ELSE 0 END) as purchases"),
                DB::raw("SUM(CASE WHEN event_name = 'Purchase' THEN COALESCE(value_poisha, 0) ELSE 0 END) as revenue_poisha"),
                DB::raw("MAX(CASE WHEN event_name = 'InitiateCheckout' THEN value_poisha ELSE NULL END) as checkout_poisha"),
                DB::raw("SUM(CASE WHEN event_name IN ('PageView', 'ViewContent') THEN 0 ELSE 1 END) as actions"),
            ]);
    }

    /* ---- Buckets for the chart ------------------------------------------ */

    /**
     * The chart's x-axis: every hour or day from the start of the window to
     * the end of its span, including the empty ones.
     *
     * A day with no traffic is a point at zero, never a missing point - a gap
     * silently closed up turns a real dip into a smooth line.
     *
     * @return list<array{key: string, at: CarbonImmutable}>
     */
    public function buckets(bool $previous = false): array
    {
        $from  = $previous ? $this->prevStart : $this->start;
        $count = $this->bucketCount();
        $out   = [];

        for ($i = 0; $i < $count; $i++) {
            $at    = $this->bucket === 'hour' ? $from->addHours($i) : $from->addDays($i);
            $out[] = [
                'key' => $this->bucket === 'hour' ? $at->format('Y-m-d H:00:00') : $at->format('Y-m-d'),
                'at'  => $at,
            ];
        }

        return $out;
    }

    /** The end of the comparison period's chart span - its window, drawn to full length. */
    public function prevSpanEnd(): CarbonImmutable
    {
        return $this->bucket === 'hour'
            ? $this->prevStart->addHours($this->bucketCount())
            : $this->prevStart->addDays($this->bucketCount());
    }

    /** The SQL expression that files an event into its bucket. */
    public function bucketExpression(): string
    {
        return $this->bucket === 'hour'
            ? "DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00')"
            : 'DATE(created_at)';
    }

    private function bucketCount(): int
    {
        $count = $this->bucket === 'hour'
            ? (int) round($this->start->diffInHours($this->spanEnd, true))
            : (int) round($this->start->diffInDays($this->spanEnd, true));

        return max(1, $count);
    }

    /* ---- Presentation ---------------------------------------------------- */

    public function segmented(): bool
    {
        return $this->channel !== null || $this->device !== null || $this->campaign !== null;
    }

    /** What the screen shows about the slice it is looking at. */
    public function toArray(): array
    {
        // `to` is inclusive for people: a window ending at midnight ends on
        // the day before it.
        $lastDay = $this->end->equalTo($this->end->startOfDay()) ? $this->end->subDay() : $this->end;
        $prevLastDay = $this->prevEnd->equalTo($this->prevEnd->startOfDay()) ? $this->prevEnd->subDay() : $this->prevEnd;

        return [
            'period'       => $this->period,
            'label'        => self::PERIODS[$this->period] ?? $this->period,
            'from'         => $this->start->toDateString(),
            'to'           => $lastDay->toDateString(),
            'prevFrom'     => $this->prevStart->toDateString(),
            'prevTo'       => $prevLastDay->toDateString(),
            'compareLabel' => $this->compareLabel,
            'bucket'       => $this->bucket,
            'channel'      => $this->channel,
            'device'       => $this->device,
            'campaign'     => $this->campaign,
            'segmented'    => $this->segmented(),
        ];
    }
}
