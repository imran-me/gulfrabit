<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Modules\Catalog\Models\Category;
use Modules\Catalog\Models\Product;

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

        // Slug is what the panel addresses a category by, so the parent is
        // reported as a slug too. The client never sees an id, which means a
        // re-seed that renumbers rows cannot break a screen mid-edit.
        $slugById = $categories->pluck('slug', 'id');

        return response()->json([
            'data' => $categories->map(fn (Category $c): array => [
                'slug'        => $c->slug,
                'name'        => $c->name,
                'blurb'       => $c->blurb,
                'audience'    => $c->audience,
                'icon'        => $c->icon,
                'image'       => $c->image,
                'parent'      => $c->parent_id ? ($slugById[$c->parent_id] ?? null) : null,
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
            'icon'     => ['sometimes', 'nullable', 'string', 'max:48'],
            'image'    => ['sometimes', 'nullable', 'string', 'max:255'],
            'parent'   => ['sometimes', 'nullable', 'string', 'exists:categories,slug'],
        ]);

        $parent = null;

        if (! empty($data['parent'])) {
            $parent = Category::where('slug', $data['parent'])->firstOrFail();

            // One level only. Not a database limit — a self-referencing table
            // nests forever — but a shop decision: a three-deep menu on a phone
            // is a menu nobody reaches the bottom of, and every breadcrumb,
            // filter and nav renderer would need to handle arbitrary depth for
            // a structure no catalogue this size needs.
            if ($parent->parent_id !== null) {
                return response()->json([
                    'message' => "'{$parent->name}' is already a sub-category. "
                        . 'Categories go one level deep — pick a top-level category instead.',
                ], 422);
            }
        }

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
            'audience'     => $data['audience'] ?? ($parent?->audience ?? 'retail'),
            'icon'         => $data['icon'] ?? null,
            'image'        => $data['image'] ?? null,
            'parent_id'    => $parent?->id,
            'is_active'    => true,
            // A sub-category inherits its parent's place in the nav rather than
            // claiming a slot of its own — it is reached by opening the parent.
            'show_in_menu' => $parent === null,
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
            'icon'       => ['sometimes', 'nullable', 'string', 'max:48'],
            'image'      => ['sometimes', 'nullable', 'string', 'max:255'],
            'parent'     => ['sometimes', 'nullable', 'string'],
            'isActive'   => ['sometimes', 'boolean'],
            'showInMenu' => ['sometimes', 'boolean'],
            'sortOrder'  => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);

        if (array_key_exists('parent', $data)) {
            $error = $this->reparent($category, $data['parent']);

            if ($error !== null) {
                return response()->json(['message' => $error], 422);
            }
        }

        if (array_key_exists('name', $data))       $category->name = $data['name'];
        if (array_key_exists('blurb', $data))      $category->blurb = $data['blurb'];
        if (array_key_exists('icon', $data))       $category->icon = $data['icon'] ?: null;
        if (array_key_exists('image', $data))      $category->image = $data['image'] ?: null;
        if (array_key_exists('isActive', $data))   $category->is_active = $data['isActive'];
        if (array_key_exists('showInMenu', $data)) $category->show_in_menu = $data['showInMenu'];
        if (array_key_exists('sortOrder', $data))  $category->sort_order = $data['sortOrder'];

        $category->save();

        // Reported back so the panel can say "12 products hidden" rather than
        // leaving the merchant to discover the scale of what they just did by
        // looking at the shop.
        //
        // Counted across the sub-tree, not just this row: switching off a
        // parent takes its sub-categories' products down with it (the cascade
        // is in Product::scopeActive), and reporting only the parent's own
        // products would understate what just happened.
        $ids = $category->children()->pluck('id')->push($category->id);

        $affected = Product::query()
            ->whereIn('category_id', $ids)
            ->where('is_active', true)
            ->count();

        return response()->json([
            'data' => ['slug' => $category->slug, 'isActive' => $category->is_active],
            'affectedProducts' => $affected,
        ]);
    }

    /**
     * Move a category under a new parent, or out to the top level.
     *
     * Returns null on success, or a message explaining the refusal. Every
     * refusal here is a structure that would break something downstream:
     *
     *  - Its own child as its parent, or itself — a cycle. Any renderer that
     *    walks the tree would loop forever, and the row would vanish from
     *    every top-level query at the same time.
     *  - A parent that is itself a sub-category — three levels deep. Same
     *    reasoning as in store(): a phone menu that deep does not get used.
     *  - Becoming a sub-category while it has children of its own, which is
     *    the same three-level problem arriving from the other direction.
     */
    private function reparent(Category $category, ?string $parentSlug): ?string
    {
        if (! $parentSlug) {
            $category->parent_id = null;

            return null;
        }

        $parent = Category::where('slug', $parentSlug)->first();

        if (! $parent) {
            return 'That parent category no longer exists. Reload the page.';
        }

        if ($parent->id === $category->id) {
            return 'A category cannot be inside itself.';
        }

        if ($parent->parent_id === $category->id) {
            return "'{$parent->name}' is inside '{$category->name}'. "
                . 'Move it out to the top level first.';
        }

        if ($parent->parent_id !== null) {
            return "'{$parent->name}' is already a sub-category. "
                . 'Categories go one level deep — pick a top-level category.';
        }

        if ($category->children()->exists()) {
            return "'{$category->name}' has sub-categories of its own, so it has to stay "
                . 'at the top level. Move those out first.';
        }

        $category->parent_id = $parent->id;

        return null;
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
        // Children first: the foreign key is nullOnDelete, so deleting a parent
        // would quietly promote its sub-categories to the top level and put
        // them in the header nav. Silently restructuring the shop is not what
        // "delete this one category" means.
        $children = $category->children()->count();

        if ($children > 0) {
            return response()->json([
                'message' => "{$children} sub-categor" . ($children === 1 ? 'y is' : 'ies are')
                    . ' inside this one. Move them out or delete them first.',
            ], 422);
        }

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
