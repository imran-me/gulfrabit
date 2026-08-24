<?php

declare(strict_types=1);

namespace Modules\Catalog\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Requests\ProductIndexRequest;
use Modules\Catalog\Services\ProductQueryService;

/**
 * Product read endpoints. Thin: validation is in the FormRequest, query rules
 * are in ProductQueryService, and the storefront shape is on the model.
 */
class ProductController extends Controller
{
    public function __construct(
        private readonly ProductQueryService $products,
    ) {
    }

    /**
     * GET /api/catalog/products
     * Backs the PLP, search results and every product grid.
     */
    public function index(ProductIndexRequest $request): JsonResponse
    {
        $page = $this->products->paginate($request->filters());

        return response()->json([
            'data' => collect($page->items())
                ->map(fn (Product $p) => $p->toStorefrontArray())
                ->all(),
            'meta' => [
                'total'       => $page->total(),
                'perPage'     => $page->perPage(),
                'currentPage' => $page->currentPage(),
                'lastPage'    => $page->lastPage(),
            ],
        ]);
    }

    /**
     * GET /api/catalog/products/{product}
     * Bound on `sku`, not the auto id — see Product::getRouteKeyName().
     */
    public function show(Product $product): JsonResponse
    {
        // "Sellable" is defined once, in Product::scopeActive(): the product's
        // own flag, not archived, and the category AND its parent both
        // switched on. This line used to test $product->is_active on its own,
        // so switching a category off pulled it out of the listings, the
        // search and the menu while /product/<slug> for everything inside it
        // still answered 200 with a price and a working Add to Cart — the
        // merchant had taken the range off the shop and it was still buyable
        // by direct link. Asking the scope by primary key rather than
        // re-testing the flags here costs one indexed lookup and stops the
        // detail page drifting from the listings the next time "switched off"
        // grows another condition.
        abort_unless(
            Product::query()->active()->whereKey($product->getKey())->exists(),
            404,
        );

        $product->load(['category:id,slug,name', 'subCategory:id,slug']);

        return response()->json([
            'data' => $product->toStorefrontArray() + [
                'related' => $this->products->related($product),
            ],
        ]);
    }

    /**
     * GET /api/catalog/suggest?q=
     * Autocomplete. Separate from index() because it returns a deliberately
     * trimmed payload — a dropdown does not need descriptions or spec sheets.
     */
    public function suggest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q'     => ['required', 'string', 'max:120'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:12'],
        ]);

        return response()->json([
            'data' => $this->products->suggest($validated['q'], $validated['limit'] ?? 6),
        ]);
    }

    /**
     * GET /api/catalog/deals
     * Discounted products, deepest saving first.
     */
    public function deals(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'limit' => ['sometimes', 'integer', 'min:1', 'max:60'],
        ]);

        return response()->json([
            'data' => $this->products->deals($validated['limit'] ?? null),
        ]);
    }
}
