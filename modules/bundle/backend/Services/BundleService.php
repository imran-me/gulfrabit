<?php

declare(strict_types=1);

namespace Modules\Bundle\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Bundle\Models\ProductBundle;
use Modules\Catalog\Models\Product;

/**
 * What to show alongside a product, and — just as importantly — what to call it.
 *
 * TWO SOURCES, AND THE UI IS TOLD WHICH ONE IT GOT
 * ------------------------------------------------
 * 1. `behavioural` — SKUs that appear in real paid orders alongside this one,
 *    counted here on the server.
 * 2. `curated`     — a pairing the merchant authored, with its reasoning.
 *
 * Behavioural wins when, and only when, enough distinct orders back it. Below
 * that floor the answer is curated and says so, because "frequently bought
 * together" printed over two orders is not a statistic, it is a coincidence
 * dressed up as one. The frontend words its heading from `source`; it does not
 * decide the claim itself.
 *
 * The counting stays on the server for a second reason: the aggregate is cheap,
 * but the order table it is computed from is every customer's basket. Handing
 * that to the browser to do the same sum would be a data leak with a UI feature
 * as its excuse.
 */
final class BundleService
{
    /**
     * Distinct paid orders that must contain a pair before it may be called
     * "frequently bought together". Deliberately a floor on ORDERS, not on
     * quantity — one customer buying the same two things ten times is one
     * person's habit, not a pattern.
     */
    private const MIN_ORDERS_FOR_BEHAVIOURAL = 5;

    /** How many companions to return, at most. */
    private const MAX_COMPANIONS = 4;

    /**
     * @return array{
     *   id:string, title:string, reason:string, source:string,
     *   anchor:array<string,mixed>, companions:array<int,array<string,mixed>>
     * }|null  null when nothing sensible can be offered
     */
    public function forProduct(string $sku): ?array
    {
        $anchor = Product::query()->active()->where('sku', $sku)->first();

        if ($anchor === null) {
            return null;
        }

        $behavioural = $this->behaviouralCompanions($sku);

        if ($behavioural !== []) {
            return $this->shape(
                id:      'co-purchase',
                title:   'Frequently bought together',
                reason:  'Based on what other customers ordered with this item.',
                source:  'behavioural',
                anchor:  $anchor,
                skus:    $behavioural,
            );
        }

        return $this->curatedFor($sku, $anchor);
    }

    /**
     * SKUs co-purchased with this one, most frequent first, above the floor.
     *
     * Only paid orders count. A pending or failed order is an intention, not a
     * purchase, and letting abandoned baskets vote would let anyone manufacture
     * a "frequently bought together" pairing by starting checkouts.
     *
     * @return array<int, string>
     */
    private function behaviouralCompanions(string $sku): array
    {
        // `order_items` belongs to modules/checkout. This module reads it but
        // does not import a single class from it, so the dependency graph stays
        // one-way — and if checkout is ever removed, the table goes with it and
        // this degrades to curated pairings instead of throwing on every
        // product page. The module rule has to hold in both directions.
        if (! Schema::hasTable('order_items') || ! Schema::hasTable('orders')) {
            return [];
        }

        $orderIds = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.sku', $sku)
            ->where('orders.payment_status', 'paid')
            ->distinct()
            ->pluck('order_items.order_id');

        if ($orderIds->count() < self::MIN_ORDERS_FOR_BEHAVIOURAL) {
            return [];
        }

        return DB::table('order_items')
            ->select('sku', DB::raw('COUNT(DISTINCT order_id) as order_count'))
            ->whereIn('order_id', $orderIds)
            ->where('sku', '!=', $sku)
            ->groupBy('sku')
            ->having('order_count', '>=', self::MIN_ORDERS_FOR_BEHAVIOURAL)
            ->orderByDesc('order_count')
            ->limit(self::MAX_COMPANIONS)
            ->pluck('sku')
            ->all();
    }

    /** The merchant's pairing. First match wins — file order is their priority. */
    private function curatedFor(string $sku, Product $anchor): ?array
    {
        $bundle = ProductBundle::query()
            ->active()
            ->get()
            ->first(fn (ProductBundle $b): bool => $b->contains($sku));

        if ($bundle === null) {
            return null;
        }

        $companions = array_values(array_filter(
            $bundle->memberSkus(),
            static fn (string $member): bool => $member !== $sku,
        ));

        return $this->shape(
            id:      $bundle->key,
            title:   $bundle->title,
            reason:  $bundle->reason,
            source:  'curated',
            anchor:  $anchor,
            skus:    array_slice($companions, 0, self::MAX_COMPANIONS),
        );
    }

    /**
     * Resolve SKUs to storefront products and drop what cannot be sold.
     *
     * Out-of-stock and delisted members are removed rather than shown greyed
     * out: this block exists to be added to a cart, and offering a pairing that
     * cannot complete is worse than offering none. If nothing survives, the
     * whole block is withheld.
     *
     * @param array<int, string> $skus
     */
    private function shape(
        string $id,
        string $title,
        string $reason,
        string $source,
        Product $anchor,
        array $skus,
    ): ?array {
        if ($skus === []) {
            return null;
        }

        $found = Product::query()
            ->active()
            ->where('in_stock', true)
            ->whereIn('sku', $skus)
            ->get()
            ->keyBy('sku');

        // Re-order to match $skus: whereIn returns rows in the database's order,
        // not the merchant's, and the sequence is part of what was authored.
        $companions = [];
        foreach ($skus as $memberSku) {
            if ($found->has($memberSku)) {
                $companions[] = $found[$memberSku]->toStorefrontArray();
            }
        }

        if ($companions === []) {
            return null;
        }

        return [
            'id'         => $id,
            'title'      => $title,
            'reason'     => $reason,
            'source'     => $source,
            'anchor'     => $anchor->toStorefrontArray(),
            'companions' => $companions,
        ];
    }
}
