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
        abort_unless($product->is_active, 404);

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
