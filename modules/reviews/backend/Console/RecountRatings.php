<?php

declare(strict_types=1);

namespace Modules\Reviews\Console;

use Illuminate\Console\Command;
use Modules\Catalog\Models\Product;
use Modules\Reviews\Services\ReviewService;

/**
 * Rewrite every product's rating from its published reviews.
 *
 * WHY IT EXISTS, beyond tidiness. Before this module, `rating` and
 * `review_count` were numbers a seeder wrote — the live shop advertised
 * "4.7 from 288 reviews" for products that had never been reviewed, and the
 * product page published those figures to Google as AggregateRating.
 *
 * Running this once sets every product to what is actually true, which for a
 * shop with no reviews yet means zero across the board. That is the intended
 * outcome, not a bug: the storefront draws "No reviews yet" instead of stars
 * at zero, and product-page.js omits the AggregateRating markup entirely when
 * the rating is zero, so the invented claim stops being made.
 *
 * Afterwards it is a repair tool. ReviewService::recount() runs inside every
 * moderation change, so the numbers should never drift — but a restored
 * database, an import, or a product purged out from under its reviews are all
 * reasons to be able to say "recompute the lot" without guessing.
 *
 *     php artisan reviews:recount
 *     php artisan reviews:recount --dry-run
 */
class RecountRatings extends Command
{
    protected $signature = 'reviews:recount {--dry-run : Show what would change and write nothing}';

    protected $description = 'Recompute every product rating from its published reviews';

    public function handle(ReviewService $reviews): int
    {
        $dry = (bool) $this->option('dry-run');

        // withTrashed: a deleted product can be restored, and it should not
        // come back carrying a rating nothing supports.
        $products = Product::withTrashed()->orderBy('id')->get(['id', 'sku', 'title', 'rating', 'review_count']);

        if ($products->isEmpty()) {
            $this->info('No products.');

            return self::SUCCESS;
        }

        $changed = 0;

        foreach ($products as $product) {
            $before = [(float) $product->rating, (int) $product->review_count];

            if (! $dry) {
                $reviews->recount($product->id);
            }

            $after = $dry
                ? $this->wouldBe($product->id)
                : (function () use ($product): array {
                    $fresh = Product::withTrashed()->find($product->id);

                    return [(float) $fresh->rating, (int) $fresh->review_count];
                })();

            if ($before === $after) {
                continue;
            }

            $changed++;

            $this->line(sprintf(
                '  %-14s %s  %s★/%d  ->  %s★/%d',
                $product->sku,
                str_pad(mb_substr((string) $product->title, 0, 34), 34),
                number_format($before[0], 1),
                $before[1],
                number_format($after[0], 1),
                $after[1],
            ));
        }

        $this->newLine();

        $this->info(sprintf(
            '%s %d of %d product%s.',
            $dry ? 'Would change' : 'Changed',
            $changed,
            $products->count(),
            $products->count() === 1 ? '' : 's',
        ));

        if (! $dry && $changed) {
            $this->comment('Products at 0 now show "No reviews yet" and publish no rating markup.');
        }

        return self::SUCCESS;
    }

    /** @return array{0: float, 1: int} */
    private function wouldBe(int $productId): array
    {
        $stats = \Modules\Reviews\Models\ProductReview::query()
            ->where('product_id', $productId)
            ->published()
            ->selectRaw('count(*) as total, avg(rating) as average')
            ->first();

        $total = (int) ($stats->total ?? 0);

        return [$total > 0 ? round((float) $stats->average, 1) : 0.0, $total];
    }
}
