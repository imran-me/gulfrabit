<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use Illuminate\Support\Facades\DB;
use Modules\Marketing\Models\TrackingEvent;
use Throwable;

/**
 * The Tracking screen's breakdowns: where visits came from, what they arrived
 * on, which products they looked at, what they searched for, and where the
 * checkout lost them.
 *
 * Every visit-counting report here groups TrackerFilter::sessionFacts() - the
 * one definition of a visit - by a different column. That is what keeps
 * "conversion 2.1%" in the headline and the sum of the channel table's
 * conversions in agreement.
 */
final class TrackerReports
{
    /** The same aggregates for every breakdown, so every table reads alike. */
    private const AGG = 'COUNT(*) as sessions, '
        . 'COUNT(DISTINCT visitor_id) as visitors, '
        . 'SUM(CASE WHEN pages <= 1 AND actions = 0 THEN 1 ELSE 0 END) as bounced, '
        . 'SUM(carted) as carted, '
        . 'SUM(checkout) as checkouts, '
        . 'SUM(purchased) as converted, '
        . 'SUM(purchases) as orders, '
        . 'SUM(revenue_poisha) as revenue_poisha';

    /** Columns a breakdown may group by. Never a request value - these are interpolated. */
    private const DIMENSIONS = ['channel', 'device', 'os', 'browser', 'visit_type', 'landing_path'];

    public function __construct(private readonly OrderOutcomes $outcomes)
    {
    }

    /* ---- Sources --------------------------------------------------------- */

    public function sources(TrackerFilter $f): array
    {
        return [
            'channels'  => $this->breakdown($f, 'channel', 20),
            'campaigns' => $this->campaigns($f),
            'ads'       => $this->ads($f),
            'landings'  => $this->breakdown($f, 'landing_path', 25),
            'referrers' => $this->referrers($f),
            'outcomes'  => $this->outcomes->byChannel($this->outcomes->linked($f)),
        ];
    }

    /**
     * Visits in the slice grouped by one column of the visit.
     *
     * @return list<array<string, mixed>>
     */
    public function breakdown(TrackerFilter $f, string $column, int $limit = 20): array
    {
        if (! in_array($column, self::DIMENSIONS, true)) {
            return [];
        }

        return DB::query()
            ->fromSub($f->sessionFacts(), 's')
            ->groupBy($column)
            ->selectRaw($column . ' as k')
            ->selectRaw(self::AGG)
            ->orderByDesc('sessions')
            ->limit($limit)
            ->get()
            ->map(fn ($r): array => $this->shape($r, ['key' => $r->k]))
            ->all();
    }

    /**
     * Campaigns by their FIRST-touch utm tags - the ad that first brought the
     * visitor, even when this visit came back on its own. That is what the
     * ad is owed credit for, and why this table and the channel table can
     * disagree about the same visit without either being wrong.
     */
    private function campaigns(TrackerFilter $f): array
    {
        return DB::query()
            ->fromSub($f->sessionFacts(), 's')
            ->groupBy('utm_campaign', 'utm_source', 'utm_medium')
            ->selectRaw('utm_campaign, utm_source, utm_medium')
            ->selectRaw(self::AGG)
            ->orderByDesc('sessions')
            ->limit(30)
            ->get()
            ->map(fn ($r): array => $this->shape($r, [
                'campaign' => $r->utm_campaign,
                'source'   => $r->utm_source,
                'medium'   => $r->utm_medium,
            ]))
            ->all();
    }

    /**
     * The individual ads, when the campaign was tagged with utm_content - the
     * one table that answers "which creative sells", which Ads Manager
     * reports as clicks and this reports as orders.
     */
    private function ads(TrackerFilter $f): array
    {
        return DB::query()
            ->fromSub($f->sessionFacts(), 's')
            ->whereNotNull('utm_content')
            ->groupBy('utm_campaign', 'utm_content')
            ->selectRaw('utm_campaign, utm_content')
            ->selectRaw(self::AGG)
            ->orderByDesc('sessions')
            ->limit(30)
            ->get()
            ->map(fn ($r): array => $this->shape($r, [
                'campaign' => $r->utm_campaign,
                'content'  => $r->utm_content,
            ]))
            ->all();
    }

    private function referrers(TrackerFilter $f): array
    {
        return $f->events()
            ->toBase()
            ->whereNotNull('referrer_host')
            ->groupBy('referrer_host')
            ->selectRaw('referrer_host, COUNT(DISTINCT session_id) as sessions')
            ->orderByDesc('sessions')
            ->limit(20)
            ->get()
            ->map(fn ($r): array => ['host' => (string) $r->referrer_host, 'sessions' => (int) $r->sessions])
            ->all();
    }

    /* ---- Audience -------------------------------------------------------- */

    public function audience(TrackerFilter $f): array
    {
        return [
            'devices'    => $this->breakdown($f, 'device', 10),
            'os'         => $this->breakdown($f, 'os', 10),
            'browsers'   => $this->breakdown($f, 'browser', 15),
            'visitTypes' => $this->breakdown($f, 'visit_type', 5),
            'heatmap'    => $this->heatmap($f),
            'geo'        => $this->outcomes->geography($f, $this->outcomes->linked($f)),
        ];
    }

    /**
     * Visits by day of the week and hour of the day, in the shop's own time
     * zone - when to post, when to raise an ad's budget, when to have
     * somebody answering the phone.
     *
     * `d` is MySQL's WEEKDAY(): 0 is Monday. The screen orders the rows from
     * Saturday, the first day of the Bangladeshi working week.
     */
    public function heatmap(TrackerFilter $f): array
    {
        $cells = $f->events()
            ->toBase()
            ->whereNotNull('session_id')
            ->selectRaw('WEEKDAY(created_at) as d, HOUR(created_at) as h')
            ->selectRaw('COUNT(DISTINCT session_id) as sessions')
            ->selectRaw("SUM(CASE WHEN event_name = 'Purchase' THEN 1 ELSE 0 END) as orders")
            ->groupBy(DB::raw('WEEKDAY(created_at)'), DB::raw('HOUR(created_at)'))
            ->get()
            ->map(fn ($r): array => [
                'd'        => (int) $r->d,
                'h'        => (int) $r->h,
                'sessions' => (int) $r->sessions,
                'orders'   => (int) $r->orders,
            ])
            ->all();

        return [
            'cells' => $cells,
            'max'   => $cells === [] ? 0 : max(array_column($cells, 'sessions')),
        ];
    }

    /* ---- Products -------------------------------------------------------- */

    public const PRODUCT_SORTS = ['views', 'carts', 'orders', 'wishlist', 'cart_rate', 'order_rate'];

    /**
     * Every product visitors touched: how many visits opened it, saved it,
     * carted it and bought it, and what the shop's catalogue says about it
     * now - price, photo, stock.
     *
     * The flags are the point. A product opened by forty visits and carted by
     * one is telling the merchant something about its price, photos or
     * description; a product that is out of stock and still being opened is
     * demand walking away. Thresholds are deliberately high enough that a
     * flag means something - a flag on every row is a flag nobody reads.
     */
    public function products(TrackerFilter $f, string $sort = 'views'): array
    {
        $rows = $f->events()
            ->toBase()
            ->whereNotNull('product_id')
            ->whereIn('event_name', ['ViewContent', 'AddToCart', 'AddToWishlist'])
            ->groupBy('product_id')
            ->selectRaw('product_id')
            ->selectRaw("COUNT(DISTINCT CASE WHEN event_name = 'ViewContent' THEN session_id END) as views")
            ->selectRaw("COUNT(DISTINCT CASE WHEN event_name = 'AddToCart' THEN session_id END) as carts")
            ->selectRaw("COUNT(DISTINCT CASE WHEN event_name = 'AddToWishlist' THEN session_id END) as wishlist")
            ->selectRaw('MAX(content_name) as name')
            ->orderByDesc('views')
            ->limit(300)
            ->get();

        $items = [];
        foreach ($rows as $r) {
            $items[(string) $r->product_id] = [
                'id'       => (string) $r->product_id,
                'name'     => $r->name,
                'views'    => (int) $r->views,
                'carts'    => (int) $r->carts,
                'wishlist' => (int) $r->wishlist,
                'orders'   => 0,
            ];
        }

        // Purchases carry every product in the cart, so they are counted here
        // rather than grouped in SQL - unpacking a JSON array portably across
        // MySQL and MariaDB is not worth what it would cost to maintain.
        foreach ($this->boughtCounts($f) as $id => $n) {
            $items[$id] ??= ['id' => $id, 'name' => null, 'views' => 0, 'carts' => 0, 'wishlist' => 0, 'orders' => 0];
            $items[$id]['orders'] = $n;
        }

        $catalog = $this->catalog(array_keys($items));
        $out     = [];

        foreach ($items as $id => $it) {
            $p       = $catalog[$id] ?? null;
            $inStock = $p === null ? null : ((bool) $p->in_stock && ($p->stock_qty === null || (int) $p->stock_qty > 0));

            $viewToCart  = $it['views'] > 0 ? round($it['carts'] / $it['views'] * 100, 1) : null;
            $viewToOrder = $it['views'] > 0 ? round($it['orders'] / $it['views'] * 100, 1) : null;

            $flags = [];
            if ($it['views'] >= 15 && $viewToCart !== null && $viewToCart < 4) {
                $flags[] = 'look-not-add';
            }
            if ($it['carts'] >= 5 && $it['orders'] / $it['carts'] < 0.2) {
                $flags[] = 'cart-not-buy';
            }
            if ($inStock === false && $it['views'] >= 3) {
                $flags[] = 'oos-demand';
            }
            if ($it['views'] >= 10 && $viewToOrder !== null && $viewToOrder >= 8) {
                $flags[] = 'star';
            }

            // array_merge, not +: the catalogue's title must REPLACE the name
            // the event carried, and + keeps the left-hand key.
            $out[] = array_merge($it, [
                'name'          => $p->title ?? $it['name'] ?? $id,
                'slug'          => $p->slug ?? null,
                'image'         => $p->image ?? null,
                'priceTaka'     => $p !== null ? intdiv((int) $p->price_poisha, 100) : null,
                'inStock'       => $inStock,
                'stockQty'      => $p !== null && $p->stock_qty !== null ? (int) $p->stock_qty : null,
                'viewToCartPct' => $viewToCart,
                'viewToOrderPct' => $viewToOrder,
                'flags'         => $flags,
            ]);
        }

        $sort = in_array($sort, self::PRODUCT_SORTS, true) ? $sort : 'views';
        $key  = match ($sort) {
            'cart_rate'  => 'viewToCartPct',
            'order_rate' => 'viewToOrderPct',
            default      => $sort,
        };

        usort($out, fn (array $a, array $b): int => [($b[$key] ?? -1), $b['views']] <=> [($a[$key] ?? -1), $a['views']]);

        return [
            'sort'     => $sort,
            'products' => array_slice($out, 0, 100),
            'totals'   => [
                'products' => count($out),
                'views'    => array_sum(array_column($out, 'views')),
                'carts'    => array_sum(array_column($out, 'carts')),
                'orders'   => array_sum(array_column($out, 'orders')),
            ],
        ];
    }

    /** @return array<string, int> tracked purchases containing each product */
    private function boughtCounts(TrackerFilter $f): array
    {
        $bought = [];

        $purchases = $f->events()
            ->where('event_name', 'Purchase')
            ->limit(10000)
            ->get(['content_ids']);

        foreach ($purchases as $p) {
            $ids = array_filter((array) ($p->content_ids ?? []), 'is_scalar');
            foreach (array_unique(array_map('strval', $ids)) as $id) {
                if ($id !== '') {
                    $bought[$id] = ($bought[$id] ?? 0) + 1;
                }
            }
        }

        return $bought;
    }

    /**
     * What the catalogue says about some SKUs today.
     *
     * Read through the table, not the catalogue's model: this module must not
     * import another module's code for a name and a photo, and if the
     * catalogue is ever removed the report falls back to the names the events
     * carried rather than failing.
     *
     * @param  list<string> $skus
     * @return array<string, object>
     */
    public function catalog(array $skus): array
    {
        if ($skus === []) {
            return [];
        }

        $out = [];

        try {
            foreach (array_chunk($skus, 500) as $chunk) {
                $rows = DB::table('products')
                    ->whereIn('sku', $chunk)
                    ->get(['sku', 'title', 'slug', 'image', 'price_poisha', 'in_stock', 'stock_qty']);

                foreach ($rows as $p) {
                    $out[(string) $p->sku] = $p;
                }
            }
        } catch (Throwable) {
            return [];
        }

        return $out;
    }

    /* ---- Search ---------------------------------------------------------- */

    /**
     * What people typed, whether it found anything, and whether the visit
     * went on to buy.
     *
     * The "found nothing" list is the most valuable table on the screen that
     * no other tool builds for a shop this size: every row is a customer who
     * came wanting something specific, said so in their own words, and was
     * told the shop does not have it.
     */
    public function search(TrackerFilter $f): array
    {
        $base = fn () => $f->events()->toBase()->where('event_name', 'Search')->whereNotNull('search_term');

        $terms = $base()
            ->groupBy('search_term')
            ->selectRaw('search_term as term')
            ->selectRaw('COUNT(*) as searches')
            ->selectRaw('COUNT(DISTINCT session_id) as sessions')
            ->selectRaw('SUM(CASE WHEN search_results = 0 THEN 1 ELSE 0 END) as empty')
            ->selectRaw('MAX(created_at) as last_at')
            ->orderByDesc('searches')
            ->limit(100)
            ->get();

        $after = DB::query()
            ->fromSub($base()->select(['search_term', 'session_id'])->distinct(), 'q')
            ->joinSub($f->sessionFacts(), 's', 's.session_id', '=', 'q.session_id')
            ->groupBy('q.search_term')
            ->selectRaw('q.search_term as term, SUM(s.carted) as carted, SUM(s.purchased) as converted')
            ->get()
            ->keyBy(fn ($r): string => (string) $r->term);

        $empty = $base()
            ->where('search_results', 0)
            ->groupBy('search_term')
            ->selectRaw('search_term as term, COUNT(*) as searches, COUNT(DISTINCT session_id) as sessions, MAX(created_at) as last_at')
            ->orderByDesc('searches')
            ->limit(50)
            ->get()
            ->map(fn ($r): array => [
                'term'     => (string) $r->term,
                'searches' => (int) $r->searches,
                'sessions' => (int) $r->sessions,
                'lastAt'   => (string) $r->last_at,
            ])
            ->all();

        $searchers = $f->events()->toBase()
            ->where('event_name', 'Search')
            ->whereNotNull('session_id')
            ->select('session_id')
            ->distinct();

        $cmp = DB::query()
            ->fromSub($f->sessionFacts(), 's')
            ->leftJoinSub($searchers, 'q', 'q.session_id', '=', 's.session_id')
            ->selectRaw('SUM(CASE WHEN q.session_id IS NULL THEN 0 ELSE 1 END) as searchers')
            ->selectRaw('SUM(CASE WHEN q.session_id IS NULL THEN 0 ELSE s.purchased END) as searchers_converted')
            ->selectRaw('SUM(CASE WHEN q.session_id IS NULL THEN 1 ELSE 0 END) as others')
            ->selectRaw('SUM(CASE WHEN q.session_id IS NULL THEN s.purchased ELSE 0 END) as others_converted')
            ->first();

        $searchersN = (int) ($cmp->searchers ?? 0);
        $othersN    = (int) ($cmp->others ?? 0);

        return [
            'terms' => $terms->map(fn ($r): array => [
                'term'      => (string) $r->term,
                'searches'  => (int) $r->searches,
                'sessions'  => (int) $r->sessions,
                'empty'     => (int) $r->empty,
                'carted'    => (int) ($after[(string) $r->term]->carted ?? 0),
                'converted' => (int) ($after[(string) $r->term]->converted ?? 0),
                'lastAt'    => (string) $r->last_at,
            ])->all(),
            'empty'  => $empty,
            'totals' => [
                'searches'           => (int) $base()->count(),
                'emptySearches'      => (int) $base()->where('search_results', 0)->count(),
                'searchers'          => $searchersN,
                'searchersConverted' => (int) ($cmp->searchers_converted ?? 0),
                'others'             => $othersN,
                'othersConverted'    => (int) ($cmp->others_converted ?? 0),
                'searchersPct'       => $searchersN > 0 ? round((int) $cmp->searchers_converted / $searchersN * 100, 2) : null,
                'othersPct'          => $othersN > 0 ? round((int) $cmp->others_converted / $othersN * 100, 2) : null,
            ],
        ];
    }

    /* ---- Checkout -------------------------------------------------------- */

    /**
     * Where the last step loses people, and what it lost.
     *
     * Abandoned checkouts are listed with what was in the cart, the device and
     * where the visit came from - never with a name or a phone number, because
     * this module does not have them and will not collect them. What it can
     * say is "eleven visits from Meta ads, all inside the Facebook app, all
     * stopped at the same screen", which is usually the more useful sentence.
     */
    public function checkout(TrackerFilter $f): array
    {
        $abandoned = fn () => DB::query()->fromSub($f->sessionFacts(), 's')
            ->where('checkout', 1)
            ->where('purchased', 0);

        $totals = $abandoned()
            ->selectRaw('COUNT(*) as n, SUM(COALESCE(checkout_poisha, 0)) as poisha')
            ->first();

        $rows = $abandoned()
            ->orderByDesc('ended_at')
            ->limit(100)
            ->get();

        // What was in each of those carts: the visit's LAST InitiateCheckout,
        // because a shopper who went back and changed the cart abandoned the
        // second version, not the first.
        $carts = [];
        if ($rows->isNotEmpty()) {
            TrackingEvent::query()
                ->whereIn('session_id', $rows->pluck('session_id')->all())
                ->where('event_name', 'InitiateCheckout')
                ->orderBy('id')
                ->get(['session_id', 'content_ids', 'num_items', 'value_poisha'])
                ->each(function (TrackingEvent $e) use (&$carts): void {
                    $carts[(string) $e->session_id] = $e;
                });
        }

        $skus = [];
        foreach ($carts as $e) {
            foreach (array_filter((array) ($e->content_ids ?? []), 'is_scalar') as $id) {
                $skus[(string) $id] = true;
            }
        }
        $names = $this->names(array_keys($skus));

        $steps = DB::query()->fromSub($f->sessionFacts(), 's')
            ->selectRaw('SUM(carted) as carted, SUM(checkout) as checkouts, SUM(purchased) as converted')
            ->selectRaw('SUM(CASE WHEN carted = 1 AND checkout = 0 AND purchased = 0 THEN 1 ELSE 0 END) as cart_only')
            ->first();

        $linked = $this->outcomes->linked($f);

        return [
            'abandoned' => [
                'count'     => (int) ($totals->n ?? 0),
                'valueTaka' => intdiv((int) ($totals->poisha ?? 0), 100),
                'rows'      => $rows->map(function ($s) use ($carts, $names): array {
                    $cart = $carts[(string) $s->session_id] ?? null;
                    $ids  = $cart ? array_map('strval', array_filter((array) ($cart->content_ids ?? []), 'is_scalar')) : [];

                    return [
                        'session_id'   => (string) $s->session_id,
                        'started_at'   => (string) $s->started_at,
                        'ended_at'     => (string) $s->ended_at,
                        'channel'      => $s->channel,
                        'device'       => $s->device,
                        'browser'      => $s->browser,
                        'visit_type'   => $s->visit_type,
                        'landing_path' => $s->landing_path,
                        'utm_campaign' => $s->utm_campaign,
                        'pages'        => (int) $s->pages,
                        'valueTaka'    => $s->checkout_poisha !== null ? intdiv((int) $s->checkout_poisha, 100) : null,
                        'items'        => $cart?->num_items,
                        'products'     => array_values(array_map(fn (string $id): string => $names[$id] ?? $id, $ids)),
                    ];
                })->all(),
            ],
            'steps' => [
                'carted'    => (int) ($steps->carted ?? 0),
                'checkouts' => (int) ($steps->checkouts ?? 0),
                'converted' => (int) ($steps->converted ?? 0),
                'cartOnly'  => (int) ($steps->cart_only ?? 0),
            ],
            'completion' => [
                'browsers' => $this->completion($f, 'browser'),
                'devices'  => $this->completion($f, 'device'),
            ],
            'orders'    => $this->outcomes->reconcile($f, $linked),
            'unmatched' => $linked
                ->filter(fn (array $l): bool => $l['order'] === null)
                ->take(50)
                ->map(fn (array $l): array => [
                    'event_id'   => $l['purchase']->event_id,
                    'session_id' => $l['purchase']->session_id,
                    'at'         => $l['purchase']->created_at?->toDateTimeString(),
                    'valueTaka'  => $l['purchase']->valueTaka() !== null ? (int) round($l['purchase']->valueTaka()) : null,
                    'channel'    => $l['purchase']->channel,
                    'browser'    => $l['purchase']->browser,
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * Of the visits that STARTED checkout, how many finished - per browser or
     * device. The in-app browser row against the rest is the comparison that
     * tells a Facebook-first shop whether its checkout works where its
     * customers actually are.
     */
    public function completion(TrackerFilter $f, string $column): array
    {
        if (! in_array($column, ['browser', 'device'], true)) {
            return [];
        }

        return DB::query()
            ->fromSub($f->sessionFacts(), 's')
            ->where('checkout', 1)
            ->groupBy($column)
            ->selectRaw($column . ' as k, COUNT(*) as checkouts, SUM(purchased) as converted')
            ->orderByDesc('checkouts')
            ->limit(12)
            ->get()
            ->map(fn ($r): array => [
                'key'       => $r->k,
                'checkouts' => (int) $r->checkouts,
                'converted' => (int) $r->converted,
                'pct'       => (int) $r->checkouts > 0 ? round((int) $r->converted / (int) $r->checkouts * 100, 1) : null,
            ])
            ->all();
    }

    /**
     * A display name for each SKU: the catalogue's title, or failing that the
     * name the storefront sent with the product's own events.
     *
     * @param  list<string> $skus
     * @return array<string, string>
     */
    private function names(array $skus): array
    {
        if ($skus === []) {
            return [];
        }

        $names = [];
        foreach ($this->catalog($skus) as $sku => $p) {
            $names[$sku] = (string) $p->title;
        }

        $missing = array_values(array_diff($skus, array_keys($names)));
        if ($missing !== []) {
            TrackingEvent::query()
                ->toBase()
                ->whereIn('product_id', $missing)
                ->whereNotNull('content_name')
                ->groupBy('product_id')
                ->selectRaw('product_id, MAX(content_name) as name')
                ->get()
                ->each(function ($r) use (&$names): void {
                    $names[(string) $r->product_id] = (string) $r->name;
                });
        }

        return $names;
    }

    /** @param array<string, mixed> $lead */
    private function shape(object $r, array $lead): array
    {
        return $lead + [
            'sessions'    => (int) $r->sessions,
            'visitors'    => (int) $r->visitors,
            'bounced'     => (int) $r->bounced,
            'carted'      => (int) $r->carted,
            'checkouts'   => (int) $r->checkouts,
            'converted'   => (int) $r->converted,
            'orders'      => (int) $r->orders,
            'revenueTaka' => intdiv((int) $r->revenue_poisha, 100),
        ];
    }
}
