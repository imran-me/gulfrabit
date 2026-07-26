<?php

declare(strict_types=1);

namespace Modules\Account\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Account\Models\WishlistItem;
use Modules\Catalog\Models\Product;

/**
 * Saved products.
 */
class WishlistController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = WishlistItem::query()
            ->where('user_id', $request->user()->id)
            ->with('product.category:id,slug')
            ->latest('id')
            ->get()
            // A product deleted after being saved leaves a row pointing at
            // nothing; drop it from the response rather than rendering a blank
            // card.
            ->filter(fn (WishlistItem $i) => $i->product !== null && $i->product->is_active)
            ->map(fn (WishlistItem $i) => $i->toStorefrontArray())
            ->values()
            ->all();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sku' => ['required', 'string', 'max:32', 'exists:products,sku'],
        ]);

        $product = Product::where('sku', $validated['sku'])->firstOrFail();

        // firstOrCreate, not create: saving the same product twice is a no-op,
        // not a duplicate row or a 500 from the unique index.
        WishlistItem::firstOrCreate([
            'user_id'    => $request->user()->id,
            'product_id' => $product->id,
        ]);

        return response()->json(['message' => 'Saved.'], 201);
    }

    public function destroy(Request $request, string $sku): JsonResponse
    {
        $product = Product::where('sku', $sku)->first();

        if ($product !== null) {
            WishlistItem::where('user_id', $request->user()->id)
                ->where('product_id', $product->id)
                ->delete();
        }

        // Idempotent: removing something already gone is a success, not a 404.
        // The button that calls this should never show an error for reaching
        // the state the customer asked for.
        return response()->json(['message' => 'Removed.']);
    }
}
