<?php

declare(strict_types=1);

namespace Modules\Account\Services;

use Illuminate\Support\Facades\DB;
use Modules\Account\Models\WishlistItem;
use Modules\Catalog\Models\Product;

/**
 * Saved items, and folding a guest's saves into their account.
 *
 * WHY MERGING IS A PUSH FROM THE CLIENT
 * -------------------------------------
 * `wishlist_items` requires a `user_id`, so a guest has no server-side wishlist
 * at all — theirs lives in localStorage until they sign in. That makes the
 * merge a one-way push of what the browser holds, unlike the cart, which has a
 * guest token and a row to merge from.
 *
 * The cart already did this. The wishlist did not, so a guest who saved six
 * things and then created an account arrived at an empty wishlist — with the
 * items still sitting in their browser, invisible, until localStorage was
 * cleared and they were gone. That is quiet data loss at exactly the moment
 * somebody has decided to trust the site with an account.
 */
final class WishlistService
{
    /**
     * Add any of these SKUs the user has not already saved.
     *
     * Idempotent: the unique (user_id, product_id) index means signing in twice,
     * or a retried request, adds nothing the second time. Unknown and delisted
     * SKUs are skipped rather than failing the merge — a wishlist saved months
     * ago will contain things that have since been withdrawn, and losing the
     * whole merge over one of them would be worse than losing that one.
     *
     * @param array<int, string> $skus
     * @return array{added:int, skipped:int}
     */
    public function mergeSkus(int $userId, array $skus): array
    {
        $skus = array_values(array_unique(array_filter($skus)));

        if ($skus === []) {
            return ['added' => 0, 'skipped' => 0];
        }

        $products = Product::query()
            ->active()
            ->whereIn('sku', $skus)
            ->pluck('id', 'sku');

        $added = 0;

        DB::transaction(function () use ($userId, $products, &$added): void {
            foreach ($products as $productId) {
                $item = WishlistItem::firstOrCreate([
                    'user_id'    => $userId,
                    'product_id' => $productId,
                ]);

                if ($item->wasRecentlyCreated) {
                    $added++;
                }
            }
        });

        return [
            'added'   => $added,
            // Counted and reported rather than swallowed, so a customer who
            // saved eight things and sees six can be told why.
            'skipped' => count($skus) - $products->count(),
        ];
    }
}
