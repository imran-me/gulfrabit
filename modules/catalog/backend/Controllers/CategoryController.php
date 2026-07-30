<?php

declare(strict_types=1);

namespace Modules\Catalog\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Catalog\Models\Category;

/**
 * Category read endpoints — the mega-menu, the home grid and the PLP header.
 */
class CategoryController extends Controller
{
    /**
     * GET /api/catalog/categories?audience=retail
     * Top-level categories with their children, so the mega-menu is one call.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'audience' => ['sometimes', 'in:retail,b2b'],
        ]);

        // Children are constrained to ACTIVE ones. `with('children')` loaded
        // every sub-category regardless, so a switched-off sub-category still
        // appeared in the header menu and led to an empty listing page.
        $query = Category::query()
            ->active()
            ->topLevel()
            ->with(['children' => fn ($q) => $q->where('is_active', true)->orderBy('sort_order')])
            ->orderBy('sort_order');

        if (isset($validated['audience'])) {
            $query->forAudience($validated['audience']);
        }

        return response()->json([
            'data' => $query->get()->map(fn (Category $c): array => $c->toStorefrontArray() + [
                'children' => $c->children->map(fn (Category $child) => $child->toStorefrontArray())->all(),
            ])->all(),
        ]);
    }

    /**
     * GET /api/catalog/categories/{category}
     * Bound on slug. Includes the product count so the PLP header can say
     * "6 products" without a second round trip.
     */
    public function show(Category $category): JsonResponse
    {
        abort_unless($category->is_active, 404);

        $category->loadCount(['products' => fn ($q) => $q->where('is_active', true)]);
        $category->load('children');

        return response()->json([
            'data' => $category->toStorefrontArray() + [
                'productCount' => $category->products_count,
                'children'     => $category->children->map(fn (Category $c) => $c->toStorefrontArray())->all(),
            ],
        ]);
    }
}
