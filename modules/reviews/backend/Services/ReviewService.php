<?php

declare(strict_types=1);

namespace Modules\Reviews\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Reviews\Models\ProductReview;
use RuntimeException;

/**
 * Who may review, and what a review does to a product's rating.
 *
 * Both rules live here for the same reason FolderTree owns the folder tree:
 * each of them is enforced from more than one place — the storefront asks
 * "may I?" before drawing a form, the API asks again before accepting a post,
 * and three different admin actions change a review's status — and a rule
 * with two implementations is a rule with one bug.
 */
class ReviewService
{
    /**
     * Only a delivered order counts.
     *
     * Not "placed", not "shipped". A review is about the thing in your hand,
     * and on cash-on-delivery a shipped order is one that may still be
     * refused at the door. Waiting for `delivered` costs a few days of
     * reviews and buys the only claim that makes the badge worth printing.
     */
    private const QUALIFYING_STATUS = 'delivered';

    /**
     * Can this customer review this product, and if not, why not?
     *
     * Returns a shape the storefront can render directly rather than a bare
     * boolean, because "you have already reviewed this" and "you have not
     * bought this" want completely different words on the page, and deciding
     * which in the browser would mean the browser knowing the rules.
     *
     * @return array{allowed:bool, reason:string, message:string, orderId:?int}
     */
    public function eligibility(?User $user, Product $product): array
    {
        if (! $user) {
            return $this->no('signed-out', 'Sign in to review this product.');
        }

        $existing = ProductReview::query()
            ->where('product_id', $product->id)
            ->where('user_id', $user->id)
            ->first();

        if ($existing) {
            return $this->no('already', match ($existing->status) {
                ProductReview::PENDING   => 'Your review is with us and will appear once it is checked.',
                ProductReview::PUBLISHED => 'You have already reviewed this product.',
                // Deliberately not "your review was rejected". Telling someone
                // their words were refused invites an argument the merchant
                // has no screen to have; it also tells a spammer exactly when
                // to try again. They see the same sentence as a published one.
                default                  => 'You have already reviewed this product.',
            });
        }

        $orderId = $this->qualifyingOrderId($user, $product);

        if ($orderId === null) {
            return $this->no(
                'not-bought',
                'Only customers who have received this product can review it.'
            );
        }

        return [
            'allowed' => true,
            'reason'  => 'ok',
            'message' => 'You bought this — tell other shoppers what it is like.',
            'orderId' => $orderId,
        ];
    }

    /**
     * The delivered order that contains this product, if there is one.
     *
     * Matched on product_id, and on SKU as a fallback: order lines are
     * snapshots whose product_id goes null if the product is ever purged, and
     * a customer who genuinely bought something should not lose the right to
     * review it because of a foreign key.
     */
    private function qualifyingOrderId(User $user, Product $product): ?int
    {
        return DB::table('orders')
            ->join('order_items', 'order_items.order_id', '=', 'orders.id')
            ->where('orders.user_id', $user->id)
            ->where('orders.status', self::QUALIFYING_STATUS)
            ->whereNull('orders.deleted_at')
            ->where(function ($q) use ($product): void {
                $q->where('order_items.product_id', $product->id)
                    ->orWhere('order_items.sku', $product->sku);
            })
            ->orderByDesc('orders.id')
            ->value('orders.id');
    }

    /**
     * Record a review. Always pending — nothing published without a person.
     *
     * @param  array{rating:int, title:?string, body:string}  $data
     */
    public function submit(User $user, Product $product, array $data): ProductReview
    {
        $check = $this->eligibility($user, $product);

        // Checked again here and not only in the controller. This is the last
        // gate before a row exists, and it is the one a future caller — an
        // import, a console command — will also go through.
        if (! $check['allowed']) {
            throw new RuntimeException($check['message']);
        }

        return ProductReview::create([
            'product_id'  => $product->id,
            'user_id'     => $user->id,
            'order_id'    => $check['orderId'],
            'author_name' => $this->displayName($user),
            'rating'      => $data['rating'],
            'title'       => $data['title'] ?: null,
            'body'        => $data['body'],
            'status'      => ProductReview::PENDING,
            'verified_at' => now(),
        ]);
    }

    /**
     * "Imran H." — a first name and an initial.
     *
     * A full name beside a public opinion is more of the customer than they
     * agreed to publish when they bought something, and an anonymous review is
     * worth less than a signed one. This is the middle, and it is what every
     * shop they already trust does.
     */
    private function displayName(User $user): string
    {
        $parts = preg_split('/\s+/u', trim((string) $user->name)) ?: [];
        $first = $parts[0] ?? 'Customer';
        $last = count($parts) > 1 ? mb_substr(end($parts), 0, 1) . '.' : '';

        return mb_substr(trim("{$first} {$last}"), 0, 96);
    }

    /** Publish, reject, or put back to pending — and recompute after each. */
    public function moderate(ProductReview $review, string $status, ?int $adminId): ProductReview
    {
        if (! in_array($status, [ProductReview::PENDING, ProductReview::PUBLISHED, ProductReview::REJECTED], true)) {
            throw new RuntimeException('That is not a review status.');
        }

        DB::transaction(function () use ($review, $status, $adminId): void {
            $review->update([
                'status'       => $status,
                'moderated_by' => $adminId,
                'moderated_at' => now(),
            ]);

            $this->recount($review->product_id);
        });

        return $review->fresh();
    }

    public function forget(ProductReview $review): void
    {
        $productId = $review->product_id;

        DB::transaction(function () use ($review, $productId): void {
            $review->delete();
            $this->recount($productId);
        });
    }

    /**
     * Rewrite a product's rating and review_count from its published reviews.
     *
     * THE ONLY WRITER of those two columns, and the reason the aggregate can
     * be trusted. It recomputes rather than incrementing: an increment is
     * correct until the first thing that goes wrong — a moderation reversed, a
     * review deleted, two requests at once — and then it is quietly wrong for
     * ever with nothing to notice it. A recount is a single indexed query and
     * it cannot drift.
     *
     * Rounded to one decimal because the column is decimal(2,1); rounding here
     * rather than letting the database truncate means the stored number is the
     * one this code decided on.
     */
    public function recount(int $productId): void
    {
        $stats = ProductReview::query()
            ->where('product_id', $productId)
            ->published()
            ->selectRaw('count(*) as total, avg(rating) as average')
            ->first();

        $total = (int) ($stats->total ?? 0);

        Product::withTrashed()->where('id', $productId)->update([
            // Zero, not null: a product with no reviews has no rating, and the
            // storefront already treats 0 as "do not draw stars" — which is
            // also what stops an unreviewed product publishing AggregateRating.
            'rating'       => $total > 0 ? round((float) $stats->average, 1) : 0,
            'review_count' => $total,
        ]);
    }

    /** @return array{allowed:false, reason:string, message:string, orderId:null} */
    private function no(string $reason, string $message): array
    {
        return ['allowed' => false, 'reason' => $reason, 'message' => $message, 'orderId' => null];
    }
}
