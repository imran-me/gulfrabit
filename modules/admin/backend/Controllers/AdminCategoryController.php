<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Modules\Catalog\Models\Category;

/**
 * Category management.
 *
 * THE TWO SWITCHES, AND WHY THEY ARE SEPARATE
 * -------------------------------------------
 *   is_active     off -> the category AND every product in it disappear from
 *                 the site. Reversible: switching it back restores everything,
 *                 because nothing was deleted.
 *   show_in_menu  off -> gone from the header nav only. Still shoppable, still
 *                 searchable, still linkable.
 *
 * A shop with eighteen categories cannot fit them all in a phone menu, and
 * "hide it from the nav" must not mean "stop selling it".
 *
 * The cascade lives in Product::scopeActive(), not here — one scope that every
 * listing, search and homepage rail already uses, so a category switched off
 * cannot leave its products findable somewhere nobody thought to check.
 */
class AdminCategoryController extends Controller
{
    /** GET /api/admin/categories */
    public function index(): JsonResponse
    {
        $categories = Category::query()
            ->withCount(['products as product_count'])
            ->withCount(['products as live_product_count' => fn ($q) => $q->where('is_active', true)])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $categories->map(fn (Category $c): array => [
                'slug'        => $c->slug,
                'name'        => $c->name,
                'blurb'       => $c->blurb,
                'audience'    => $c->audience,
                'isActive'    => $c->is_active,
                'showInMenu'  => $c->show_in_menu,
                'sortOrder'   => $c->sort_order,
                'products'    => $c->product_count,
                'liveProducts' => $c->live_product_count,
            ])->all(),
        ]);
    }

    /** POST /api/admin/categories */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => ['required', 'string', 'min:2', 'max:96'],
            'blurb'    => ['sometimes', 'nullable', 'string', 'max:255'],
            'audience' => ['sometimes', 'in:retail,b2b'],
        ]);

        // The slug is derived once, at creation, and never changes afterwards.
        // It is in every product URL and every link a customer may have saved —
        // editing it later would break them silently, so the panel does not
        // offer it as a field at all.
        $slug = Str::slug($data['name']);

        if (Category::query()->where('slug', $slug)->exists()) {
            return response()->json([
                'message' => "A category with the address '{$slug}' already exists.",
            ], 422);
        }

        $category = Category::create([
            'slug'         => $slug,
            'name'         => $data['name'],
            'blurb'        => $data['blurb'] ?? null,
            'audience'     => $data['audience'] ?? 'retail',
            'is_active'    => true,
            'show_in_menu' => true,
            // Last in the list. A new category appearing at the top of the nav
            // unannounced is not what anybody meant by "add a category".
            'sort_order'   => (int) Category::query()->max('sort_order') + 10,
        ]);

        return response()->json(['data' => ['slug' => $category->slug]], 201);
    }

    /** PATCH /api/admin/categories/{category} */
    public function update(Request $request, Category $category): JsonResponse
    {
        $data = $request->validate([
            'name'       => ['sometimes', 'string', 'min:2', 'max:96'],
            'blurb'      => ['sometimes', 'nullable', 'string', 'max:255'],
            'isActive'   => ['sometimes', 'boolean'],
            'showInMenu' => ['sometimes', 'boolean'],
            'sortOrder'  => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);

        if (array_key_exists('name', $data))       $category->name = $data['name'];
        if (array_key_exists('blurb', $data))      $category->blurb = $data['blurb'];
        if (array_key_exists('isActive', $data))   $category->is_active = $data['isActive'];
        if (array_key_exists('showInMenu', $data)) $category->show_in_menu = $data['showInMenu'];
        if (array_key_exists('sortOrder', $data))  $category->sort_order = $data['sortOrder'];

        $category->save();

        // Reported back so the panel can say "12 products hidden" rather than
        // leaving the merchant to discover the scale of what they just did by
        // looking at the shop.
        $affected = $category->products()->where('is_active', true)->count();

        return response()->json([
            'data' => ['slug' => $category->slug, 'isActive' => $category->is_active],
            'affectedProducts' => $affected,
        ]);
    }

    /**
     * DELETE /api/admin/categories/{category}
     *
     * Refuses while products are attached, and says how many. A category is a
     * shelf: emptying it is a decision about each product on it, and a delete
     * that silently orphaned or hid two dozen items would be the wrong kind of
     * convenient. Switching it off achieves everything a delete would, and can
     * be undone.
     */
    public function destroy(Category $category): JsonResponse
    {
        $count = $category->products()->count();

        if ($count > 0) {
            return response()->json([
                'message' => "{$count} product(s) are in this category. Switch it off instead — "
                    . 'that hides the category and its products together, and can be undone.',
            ], 422);
        }

        $category->delete();

        return response()->json(['message' => 'Category removed.']);
    }
}
