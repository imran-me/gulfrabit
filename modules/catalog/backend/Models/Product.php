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
        'sku', 'title', 'brand', 'origin', 'barcode',
        'category_id', 'sub_category_id',
        'price_poisha', 'original_price_poisha',
        'image', 'images', 'rating', 'review_count',
        'in_stock', 'stock_qty', 'tags', 'dietary',
        'short_description', 'description',
        'moq', 'price_tiers', 'specs', 'datasheet',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'images'                => 'array',
            'tags'                  => 'array',
            'dietary'               => 'array',
            'specs'                 => 'array',
            'price_tiers'           => 'array',
            'in_stock'              => 'boolean',
            'is_active'             => 'boolean',
            'rating'                => 'float',
            'price_poisha'          => 'integer',
            'original_price_poisha' => 'integer',
            'review_count'          => 'integer',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'sku';
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

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('is_active', true);
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
            'title'            => $this->title,
            'brand'            => $this->brand,
            'origin'           => $this->origin,
            'barcode'          => $this->barcode,
            'categorySlug'     => $this->category?->slug,
            'categoryName'     => $this->category?->name,
            'subSlug'          => $this->subCategory?->slug,
            'price'            => $this->priceTaka(),
            'originalPrice'    => $this->originalPriceTaka(),
            'image'            => $this->image,
            'images'           => $this->images ?? [],
            'rating'           => $this->rating,
            'reviewCount'      => $this->review_count,
            'inStock'          => $this->in_stock,
            'tags'             => $this->tags ?? [],
            'dietary'          => $this->dietary ?? [],
            'shortDescription' => $this->short_description,
            'description'      => $this->description,
            'moq'              => $this->moq,
            'priceTiers'       => $this->price_tiers,
            'specs'            => $this->specs,
            'datasheet'        => $this->datasheet,
            'createdAt'        => $this->created_at?->timestamp,
        ];
    }
}
