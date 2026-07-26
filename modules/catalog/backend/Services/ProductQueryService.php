<?php

declare(strict_types=1);

namespace Modules\Catalog\Services;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Modules\Catalog\Models\Product;

/**
 * Every catalog read goes through here — listing, filtering, sorting, search
 * and related products.
 *
 * The point of centralising it: the PLP, search results, deals rail and the
 * home page all show product grids, and they must agree on what "featured"
 * means and how a price filter behaves. Duplicating that across four
 * controllers is how a catalog starts contradicting itself.
 *
 * Filtering happens in SQL, not PHP. The mock frontend filters an in-memory
 * array because it has 44 products; this must not, or the first thousand-SKU
 * import will fall over.
 */
final class ProductQueryService
{
    /** Guard rail: a client asking for 10,000 per page is a denial-of-service. */
    private const MAX_PER_PAGE = 60;
    private const DEFAULT_PER_PAGE = 24;

    /**
     * @param array{
     *   category?:string, q?:string, brands?:array, origins?:array, tags?:array,
     *   dietary?:array, minPrice?:int, maxPrice?:int, rating?:float,
     *   inStock?:bool, onSale?:bool, sort?:string, perPage?:int
     * } $filters
     */
    public function paginate(array $filters): LengthAwarePaginator
    {
        $query = Product::query()->active()->with(['category:id,slug,name', 'subCategory:id,slug']);

        $this->applyFilters($query, $filters);
        $this->applySort($query, $filters['sort'] ?? 'featured');

        $perPage = min((int) ($filters['perPage'] ?? self::DEFAULT_PER_PAGE), self::MAX_PER_PAGE);

        return $query->paginate($perPage)->withQueryString();
    }

    /** @return array<int, array<string, mixed>> */
    public function related(Product $product, int $limit = 6): array
    {
        return Product::query()
            ->active()
            ->where('category_id', $product->category_id)
            ->whereKeyNot($product->getKey())
            ->with('category:id,slug,name')
            ->limit($limit)
            ->get()
            ->map(fn (Product $p) => $p->toStorefrontArray())
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    public function deals(?int $limit = null): array
    {
        $query = Product::query()
            ->active()
            ->discounted()
            ->with('category:id,slug,name')
            // Biggest percentage saving first. Computed in SQL so the ordering
            // survives pagination — sorting a single page in PHP would not.
            ->orderByRaw('((original_price_poisha - price_poisha) / original_price_poisha) DESC');

        if ($limit !== null) {
            $query->limit($limit);
        }

        return $query->get()->map(fn (Product $p) => $p->toStorefrontArray())->all();
    }

    /** Autocomplete. Deliberately narrow — title and brand only, so the
     *  dropdown stays predictable rather than matching on description prose. */
    public function suggest(string $term, int $limit = 6): array
    {
        $term = trim($term);
        if ($term === '') {
            return [];
        }

        return Product::query()
            ->active()
            ->where(function (Builder $q) use ($term): void {
                $q->where('title', 'like', "%{$term}%")
                    ->orWhere('brand', 'like', "%{$term}%")
                    // Or "khejur" returns nothing in the dropdown while
                    // returning results on the search page — which the customer
                    // experiences as the search being broken.
                    ->orWhereJsonContains('search_terms', mb_strtolower($term));
            })
            ->limit($limit)
            ->get(['sku', 'title', 'brand', 'image', 'category_id'])
            ->map(fn (Product $p): array => [
                'id'           => $p->sku,
                'title'        => $p->title,
                'brand'        => $p->brand,
                'image'        => $p->image,
                'categorySlug' => $p->category?->slug,
            ])
            ->all();
    }

    /* ---- internals ----------------------------------------------------- */

    private function applyFilters(Builder $query, array $f): void
    {
        if (! empty($f['category'])) {
            $query->whereHas('category', fn (Builder $q) => $q->where('slug', $f['category']));
        }

        if (! empty($f['q'])) {
            $term = mb_strtolower(trim($f['q']));
            $query->where(function (Builder $q) use ($term): void {
                // Free text matches on substring so a half-typed word still
                // finds things ("choc" -> chocolate).
                $q->where('title', 'like', "%{$term}%")
                    ->orWhere('brand', 'like', "%{$term}%")
                    ->orWhere('origin', 'like', "%{$term}%")
                    ->orWhere('short_description', 'like', "%{$term}%")
                    // Synonyms match WHOLE terms only. These are curated —
                    // romanised Bangla like "khejur" and "cha" — and substring
                    // matching them would make "cha" hit anything containing
                    // those three letters. Mirrors matchesQuery() in
                    // backend/api.js; change both together.
                    ->orWhereJsonContains('search_terms', $term);
            });
        }

        if (! empty($f['brands']))  { $query->whereIn('brand', $f['brands']); }
        if (! empty($f['origins'])) { $query->whereIn('origin', $f['origins']); }

        // Prices arrive in taka (what the user typed) and are compared in poisha.
        if (isset($f['minPrice'])) { $query->where('price_poisha', '>=', (int) $f['minPrice'] * 100); }
        if (isset($f['maxPrice'])) { $query->where('price_poisha', '<=', (int) $f['maxPrice'] * 100); }

        if (isset($f['rating']))   { $query->where('rating', '>=', (float) $f['rating']); }
        if (! empty($f['inStock'])) { $query->where('in_stock', true); }
        if (! empty($f['onSale']))  { $query->discounted(); }

        foreach ((array) ($f['tags'] ?? []) as $tag) {
            $query->whereJsonContains('tags', $tag);
        }
        foreach ((array) ($f['dietary'] ?? []) as $diet) {
            $query->whereJsonContains('dietary', $diet);
        }
    }

    private function applySort(Builder $query, string $sort): void
    {
        match ($sort) {
            'price-asc'  => $query->orderBy('price_poisha'),
            'price-desc' => $query->orderByDesc('price_poisha'),
            'newest'     => $query->orderByDesc('created_at'),
            'rating'     => $query->orderByDesc('rating'),
            // Featured first, then the better-rated of the rest. Without the
            // rating tiebreak the "featured" page order is arbitrary.
            default      => $query->orderByRaw("JSON_CONTAINS(tags, '\"featured\"') DESC")
                                  ->orderByDesc('rating'),
        };
    }
}
