<?php

declare(strict_types=1);

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A catalog product.
 *
 * @property string      $sku
 * @property string      $title
 * @property int         $price_poisha
 * @property int|null    $original_price_poisha
 * @property array|null  $tags
 * @property array|null  $specs
 */
class Product extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'sku', 'slug', 'title', 'brand', 'origin', 'barcode', 'unit',
        'category_id', 'sub_category_id',
        'price_poisha', 'original_price_poisha', 'cost_poisha',
        'image', 'images', 'variants', 'default_variant', 'rating', 'review_count',
        'in_stock', 'stock_qty', 'stock_display', 'tags', 'dietary', 'search_terms',
        'short_description', 'description', 'faq',
        'moq', 'price_tiers', 'specs', 'datasheet',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'images'                => 'array',
            'variants'              => 'array',
            'tags'                  => 'array',
            'dietary'               => 'array',
            'search_terms'          => 'array',
            'specs'                 => 'array',
            'price_tiers'           => 'array',
            'faq'                   => 'array',
            'in_stock'              => 'boolean',
            'is_active'             => 'boolean',
            'rating'                => 'float',
            'price_poisha'          => 'integer',
            'original_price_poisha' => 'integer',
            'cost_poisha'           => 'integer',
            'review_count'          => 'integer',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'sku';
    }

    /**
     * Look a product up by EITHER its slug or its SKU.
     *
     * Pretty URLs carry the slug; every link, bookmark, ad and indexed page
     * from before slugs existed carries the SKU. Both must keep working, for
     * good — a shop does not get to invalidate the address of a page someone
     * shared, and "the old URL still works" costs one extra WHERE clause.
     *
     * Slug is tried first because it is the form we now publish; the SKU
     * branch is the compatibility path. The two vocabularies cannot collide:
     * a SKU is `gr-1101` and a slug is made from a title, and even if one
     * ever did, matching the published form first is the right answer.
     */
    public function resolveRouteBinding($value, $field = null)
    {
        return $this->where('slug', $value)->first()
            ?? $this->where('sku', $value)->first();
    }

    /* ---- Relations ----------------------------------------------------- */

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function subCategory(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'sub_category_id');
    }

    /* ---- Scopes -------------------------------------------------------- */

    /**
     * Sellable: the product is on AND its category is on.
     *
     * The category check is here, in the one scope every listing, search,
     * homepage rail and API already uses, rather than repeated at each call
     * site. Switching a category off has to hide its products everywhere at
     * once — the merchant's expectation is "the category disappears from the
     * site including its products", and a scope that only checked the product
     * flag would leave them findable by search and reachable by direct link
     * while the category itself was gone.
     *
     * A product with no category stays visible: null means uncategorised, not
     * hidden, and dropping those would silently delist anything mid-migration.
     *
     * THE PARENT IS CHECKED TOO. A product in "Dates > Ajwa" must disappear
     * when "Dates" is switched off, even though "Ajwa" is still marked active.
     * Cascading by writing is_active=false onto the children instead would be
     * simpler to query and worse to live with: switching the parent back on
     * could not tell which children had been off deliberately beforehand.
     * Reading the parent at query time keeps every switch independently
     * meaningful, and one extra EXISTS on an indexed key is cheap.
     */
    public function scopeActive(Builder $q): Builder
    {
        return $q->where('products.is_active', true)
            ->where(fn (Builder $w) => $w
                ->whereNull('category_id')
                ->orWhereHas('category', fn (Builder $c) => $c
                    ->where('is_active', true)
                    ->where(fn (Builder $p) => $p
                        ->whereNull('parent_id')
                        ->orWhereHas('parent', fn (Builder $g) => $g->where('is_active', true)))));
    }

    public function scopeDiscounted(Builder $q): Builder
    {
        return $q->whereNotNull('original_price_poisha')
            ->whereColumn('original_price_poisha', '>', 'price_poisha');
    }

    /** Products carrying a given tag. JSON containment, so it stays index-free. */
    public function scopeTagged(Builder $q, string $tag): Builder
    {
        return $q->whereJsonContains('tags', $tag);
    }

    /* ---- Money --------------------------------------------------------- */

    public function priceTaka(): int
    {
        return intdiv($this->price_poisha, 100);
    }

    /**
     * Variant rows with prices converted back to taka for the API.
     *
     * The output shape is exactly what products.json has always given the
     * storefront — {label, amount, price, originalPrice, inStock} — so the PDP
     * cannot tell whether a product came from the file or the database.
     * Returns [] rather than null so callers can always iterate. The
     * `?? $this->price_poisha` fallback covers rows written before this column
     * existed — a variant with no price of its own sells at the product price
     * rather than at zero.
     *
     * NOTE WHAT IS NOT HERE: `stock_qty`. The per-pack count of what we
     * actually own is stored in the same JSON rows and is stripped on the way
     * out, exactly like `cost_poisha` is stripped from the product itself.
     * Real stock tells a competitor how fast a SKU moves; the number customers
     * see is `stock_display`, which the merchant sets by hand. Two numbers,
     * two audiences — and this method is the boundary between them.
     *
     * @return array<int, array<string, mixed>>
     */
    public function variantsTaka(): array
    {
        return array_map(fn (array $v): array => [
            'label'         => $v['label'] ?? '',
            'amount'        => $v['amount'] ?? null,
            'price'         => intdiv((int) ($v['price_poisha'] ?? $this->price_poisha), 100),
            'originalPrice' => isset($v['original_price_poisha']) && $v['original_price_poisha'] !== null
                ? intdiv((int) $v['original_price_poisha'], 100)
                : null,
            'inStock'       => (bool) ($v['in_stock'] ?? true),
            // The PUBLIC per-pack counter, and the only stock figure in this
            // array. A shop sells out of 500 g while 1 kg is stacked to the
            // ceiling, so one number for the whole product would be wrong on
            // both packs at once. Null falls back to the product's own figure
            // in the PDP, which keeps single-size products unchanged.
            'stockDisplay'  => isset($v['stock_display']) && $v['stock_display'] !== null
                ? (int) $v['stock_display']
                : null,
        ], $this->variants ?? []);
    }

    /**
     * The same rows for staff, with the count of what we hold per pack.
     *
     * Null is "not counted", not zero — the same distinction cost makes. A
     * pack nobody has counted must not read as a pack we have none of, or the
     * first person to look at the screen goes hunting for stock that is
     * sitting on the shelf.
     *
     * @return array<int, array<string, mixed>>
     */
    public function variantsAdmin(): array
    {
        $public = $this->variantsTaka();

        return array_map(
            fn (array $row, array $stored): array => $row + [
                'stockQty' => ($stored['stock_qty'] ?? null) === null ? null : (int) $stored['stock_qty'],
            ],
            $public,
            array_values($this->variants ?? []),
        );
    }

    public function originalPriceTaka(): ?int
    {
        return $this->original_price_poisha === null
            ? null
            : intdiv($this->original_price_poisha, 100);
    }

    public function isDiscounted(): bool
    {
        return $this->original_price_poisha !== null
            && $this->original_price_poisha > $this->price_poisha;
    }

    /** Whole taka saved. The absolute figure lands harder than the percentage. */
    public function savingTaka(): int
    {
        return $this->isDiscounted()
            ? intdiv($this->original_price_poisha - $this->price_poisha, 100)
            : 0;
    }

    public function discountPercent(): int
    {
        return $this->isDiscounted()
            ? (int) round(($this->original_price_poisha - $this->price_poisha) / $this->original_price_poisha * 100)
            : 0;
    }

    /**
     * The shape the storefront consumes. Kept on the model so every endpoint —
     * list, detail, search, related — returns an identical product object, and
     * the frontend never has to branch on which call produced it.
     *
     * Field names mirror the mock JSON in modules/catalog/data/ deliberately, so
     * swapping the seam from mock to HTTP changes no consumer.
     */
    public function toStorefrontArray(): array
    {
        return [
            'id'               => $this->sku,
            // The URL name. `id` stays the SKU — every consumer keys off it,
            // from cart lines to order snapshots to the wishlist — and this
            // is purely the address the page is reachable at. Null on rows
            // written before slugs existed, and every link builder falls back
            // to the SKU when it is, so nothing can break by being early.
            'slug'             => $this->slug,
            'title'            => $this->title,
            'brand'            => $this->brand,
            'origin'           => $this->origin,
            'barcode'          => $this->barcode,
            'categorySlug'     => $this->category?->slug,
            'categoryName'     => $this->category?->name,
            'subSlug'          => $this->subCategory?->slug,
            'price'            => $this->priceTaka(),
            'originalPrice'    => $this->originalPriceTaka(),
            // Deliberately NOT in the storefront payload — see toAdminArray().
            'image'            => $this->image,
            'images'           => $this->images ?? [],
            // Pack size and the packs on offer. Taka on the way out, poisha in
            // the column — same contract as `price` above, so the PDP never
            // sees a poisha value and never has to know the column exists.
            'unit'             => $this->unit,
            'variants'         => $this->variantsTaka(),
            'defaultVariant'   => $this->default_variant,
            'rating'           => $this->rating,
            'reviewCount'      => $this->review_count,
            'inStock'          => $this->in_stock,
            // The PUBLIC scarcity figure — what we tell people, set by hand in
            // the panel. Null means the PDP shows no such line. The real count
            // (per pack, in the variants JSON) never appears in this array.
            'stockDisplay'     => $this->stock_display === null ? null : (int) $this->stock_display,
            'tags'             => $this->tags ?? [],
            'dietary'          => $this->dietary ?? [],
            'searchTerms'      => $this->search_terms ?? [],
            'shortDescription' => $this->short_description,
            'description'      => $this->description,
            'faq'              => $this->faq ?? [],
            'moq'              => $this->moq,
            'priceTiers'       => $this->price_tiers,
            'specs'            => $this->specs,
            'datasheet'        => $this->datasheet,
            'createdAt'        => $this->created_at?->timestamp,
        ];
    }

    /**
     * The admin view of a product.
     *
     * Separate from toStorefrontArray() because cost is in it, and cost is the
     * one field that must never reach a customer's browser: it tells them
     * exactly how much room there is to haggle, and it tells a competitor what
     * our supplier terms are. Keeping the two serialisations apart means that
     * cannot happen by someone adding a field to the wrong array.
     */
    public function toAdminArray(): array
    {
        // array_merge, NOT `+`: the union operator keeps the LEFT side's value
        // for a duplicated key, so `variants` below would have been silently
        // discarded in favour of the storefront's copy and the per-pack counts
        // would never have reached the panel. Everything else here is a new
        // key, where the two behave identically — which is exactly why the
        // mistake would have been invisible.
        return array_merge($this->toStorefrontArray(), [
            // null means unknown, never zero — a zero cost makes every sale
            // look like pure profit.
            'costTaka'   => $this->cost_poisha === null ? null : intdiv($this->cost_poisha, 100),
            'marginTaka' => $this->cost_poisha === null
                ? null
                : intdiv($this->price_poisha - $this->cost_poisha, 100),
            'isActive'   => $this->is_active,
            'stockQty'   => $this->stock_qty,
            // The same rows the storefront gets, plus what we actually hold.
            'variants'   => $this->variantsAdmin(),
        ]);
    }
}
