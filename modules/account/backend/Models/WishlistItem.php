<?php

declare(strict_types=1);

namespace Modules\Account\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;

/**
 * A saved product.
 *
 * Reads through to the product for everything displayed — price, stock, image.
 * A wishlist is a pointer to something you still intend to buy, so it must show
 * today's numbers. Snapshotting here (as order lines do) would let the list
 * advertise a price we no longer honour.
 */
class WishlistItem extends Model
{
    use HasFactory;

    protected $fillable = ['user_id', 'product_id'];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class);
    }

    /**
     * Matches the product-card contract so the wishlist grid reuses the same
     * renderer as every other grid — one card component, no special case.
     */
    public function toStorefrontArray(): array
    {
        $p = $this->product;

        return [
            'id'            => $p?->sku,
            'title'         => $p?->title,
            'brand'         => $p?->brand,
            'image'         => $p?->image,
            'price'         => $p ? $p->priceTaka() : null,
            'originalPrice' => $p?->originalPriceTaka(),
            'inStock'       => (bool) ($p?->in_stock ?? false),
            'rating'        => $p?->rating,
            'reviewCount'   => $p?->review_count,
            'categorySlug'  => $p?->category?->slug,
            'savedAt'       => $this->created_at?->toIso8601String(),
        ];
    }
}
