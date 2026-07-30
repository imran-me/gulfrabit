<?php

declare(strict_types=1);

namespace Modules\Highlights\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Catalog\Models\Product;
use Modules\Highlights\Models\Highlight;

/**
 * The public read side: what the home page puts on each shelf.
 *
 * FALLS BACK TO THE OLD TAG BEHAVIOUR when a shelf has nothing curated. Three
 * empty strips on the home page is a worse failure than showing whatever
 * carries the `premium` tag, and it is the state a fresh install is in before
 * anybody has opened the Highlights screen. The response says which happened,
 * so the panel can tell the merchant "this is running on tags until you pick
 * something" rather than leaving them to guess.
 */
class HighlightController extends Controller
{
    /**
     * GET /api/highlights/{rail}
     *
     * NEVER 500s. This runs on the home page, and a shelf that cannot be read
     * must degrade to an empty list — the browser then falls back to its own
     * tag filter, which is exactly the behaviour that existed before this
     * module. Taking the front page down because a curation table is missing
     * would be a self-inflicted outage over a merchandising feature.
     */
    public function show(string $rail): JsonResponse
    {
        $config = Highlight::RAILS[$rail] ?? null;

        if ($config === null) {
            return response()->json(['message' => 'No such shelf.'], 404);
        }

        try {
            return $this->shelf($rail, $config);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['data' => [], 'source' => 'unavailable']);
        }
    }

    /** @param array{fallbackTag: string} $config */
    private function shelf(string $rail, array $config): JsonResponse
    {
        $curated = Highlight::query()
            ->rail($rail)
            ->with('product.category')
            ->get()
            // Unlisted or hidden-by-category products are dropped HERE rather
            // than in the query, so the shelf keeps its order and simply comes
            // back shorter. Filtering in SQL with a join would have been the
            // same result with a harder-to-read query.
            ->map(fn (Highlight $h) => $h->product)
            ->filter(fn (?Product $p): bool => $p !== null && $this->sellable($p))
            ->values();

        if ($curated->isNotEmpty()) {
            return response()->json([
                'data'   => $curated->map(fn (Product $p) => $p->toStorefrontArray())->all(),
                'source' => 'curated',
            ]);
        }

        $tagged = Product::query()
            ->active()
            ->tagged($config['fallbackTag'])
            ->with('category')
            ->limit(8)
            ->get();

        return response()->json([
            'data'   => $tagged->map(fn (Product $p) => $p->toStorefrontArray())->all(),
            'source' => 'tag',
        ]);
    }

    /**
     * Would the storefront show this product at all?
     *
     * Mirrors Product::scopeActive — including the category and grandparent
     * cascade. A curated shelf must not be the one place on the site where a
     * switched-off category's product still appears.
     */
    private function sellable(Product $product): bool
    {
        if (! $product->is_active) {
            return false;
        }

        $category = $product->category;

        if ($category === null) {
            return true;      // uncategorised is visible, same as scopeActive
        }

        if (! $category->is_active) {
            return false;
        }

        return $category->parent_id === null || (bool) $category->parent?->is_active;
    }
}
