<?php

declare(strict_types=1);

namespace Modules\Highlights\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\Product;
use Modules\Highlights\Models\Highlight;

/**
 * Curating the home page.
 *
 * The whole rail is saved at once, as an ordered list of SKUs. Add, remove and
 * reorder are the same request — the alternative is three endpoints that each
 * have to agree about positions, and a half-applied reorder is a home page
 * with two of the same product on it.
 */
class AdminHighlightController extends Controller
{
    /** How many products a single shelf may hold. */
    private const MAX_PER_RAIL = 20;

    /** GET /api/admin/highlights */
    public function index(): JsonResponse
    {
        $rails = [];

        foreach (Highlight::RAILS as $key => $config) {
            $rows = Highlight::query()->rail($key)->with('product.category')->get();

            $rails[] = [
                'rail'  => $key,
                'label' => $config['label'],
                'blurb' => $config['blurb'],
                'fallbackTag' => $config['fallbackTag'],
                'items' => $rows
                    ->filter(fn (Highlight $h): bool => $h->product !== null)
                    ->map(fn (Highlight $h): array => [
                        'sku'   => $h->product->sku,
                        'title' => $h->product->title,
                        'image' => $h->product->image,
                        'price' => intdiv($h->product->price_poisha, 100),
                        // Why a curated product is not actually on the site.
                        // A shelf of six rendering four, with no explanation,
                        // is the failure this field exists to prevent.
                        'hidden' => $this->hiddenReason($h->product),
                    ])->values()->all(),
            ];
        }

        return response()->json(['data' => $rails]);
    }

    /** PUT /api/admin/highlights/{rail} */
    public function update(Request $request, string $rail): JsonResponse
    {
        if (! isset(Highlight::RAILS[$rail])) {
            return response()->json(['message' => 'No such shelf.'], 404);
        }

        $data = $request->validate([
            'skus'   => ['present', 'array', 'max:' . self::MAX_PER_RAIL],
            'skus.*' => ['string', 'max:32'],
        ], [
            'skus.max' => 'A shelf holds at most ' . self::MAX_PER_RAIL . ' products.',
        ]);

        // Order matters and duplicates must not survive it, so unique() runs
        // before the lookup and array_values re-indexes — position comes from
        // the index, and a gap there would silently reorder the shelf.
        $skus = array_values(array_unique($data['skus']));

        $ids = Product::whereIn('sku', $skus)->pluck('id', 'sku');

        $missing = array_diff($skus, $ids->keys()->all());

        if ($missing !== []) {
            return response()->json([
                'message' => 'These products no longer exist: ' . implode(', ', $missing)
                    . '. Reload the page.',
            ], 422);
        }

        DB::transaction(function () use ($rail, $skus, $ids): void {
            // Replace wholesale. Diffing an ordered list against the database
            // to issue the minimum number of writes would be more code for a
            // table that holds a few dozen rows.
            Highlight::where('rail', $rail)->delete();

            if ($skus === []) {
                return;
            }

            $now = now();

            Highlight::insert(array_map(fn (string $sku, int $i): array => [
                'rail'       => $rail,
                'product_id' => $ids[$sku],
                'position'   => $i,
                'created_at' => $now,
                'updated_at' => $now,
            ], $skus, array_keys($skus)));
        });

        return response()->json([
            'message' => $skus === []
                // Says what happens next, because an empty shelf is not blank
                // on the site — it falls back to the tag.
                ? 'Shelf cleared. It will show tagged products until you pick some.'
                : count($skus) . ' product' . (count($skus) === 1 ? '' : 's') . ' on this shelf.',
        ]);
    }

    /** Null when the product is live; otherwise why it is not. */
    private function hiddenReason(Product $product): ?string
    {
        if (! $product->is_active) {
            return 'unlisted';
        }

        $category = $product->category;

        if ($category === null) {
            return null;
        }

        if (! $category->is_active) {
            return "category '{$category->name}' is off";
        }

        if ($category->parent_id !== null && ! $category->parent?->is_active) {
            return "parent category '{$category->parent->name}' is off";
        }

        return null;
    }
}
