<?php

declare(strict_types=1);

namespace Modules\Cart\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;

/**
 * One cart line.
 *
 * @property int         $cart_id
 * @property int         $product_id
 * @property string|null $variant
 * @property int         $qty
 * @property int         $added_price_poisha
 */
class CartItem extends Model
{
    use HasFactory;

    /** Matches the frontend stepper cap, so the two cannot disagree. */
    public const MAX_QTY = 99;

    protected $fillable = ['cart_id', 'product_id', 'variant', 'qty', 'added_price_poisha'];

    protected function casts(): array
    {
        return [
            'qty'                => 'integer',
            'added_price_poisha' => 'integer',
        ];
    }

    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class);
    }

    /**
     * Cart depends on Catalog. That direction is fine — a cart cannot exist
     * without products — but it must never invert: Catalog knows nothing about
     * carts.
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * What this line costs NOW. Always the live product price, never the
     * snapshot — the snapshot only exists to detect a change.
     */
    public function lineTotalPoisha(): int
    {
        return $this->currentUnitPricePoisha() * $this->qty;
    }

    public function currentUnitPricePoisha(): int
    {
        return (int) ($this->product?->price_poisha ?? $this->added_price_poisha);
    }

    /** True when the product's price moved since it was added. */
    public function priceChanged(): bool
    {
        return $this->currentUnitPricePoisha() !== $this->added_price_poisha;
    }

    /**
     * The shape the storefront consumes. Mirrors the localStorage line in
     * shared/js/core/state.js so swapping the mock cart for the server cart
     * changes no rendering code.
     */
    public function toStorefrontArray(): array
    {
        $unit = $this->currentUnitPricePoisha();

        return [
            'lineId'       => $this->id,
            'id'           => $this->product?->sku,
            'title'        => $this->product?->title,
            'brand'        => $this->product?->brand ?? '',
            'image'        => $this->product?->image,
            'variant'      => $this->variant,
            'qty'          => $this->qty,
            'price'        => intdiv($unit, 100),
            'lineTotal'    => intdiv($this->lineTotalPoisha(), 100),
            'inStock'      => (bool) ($this->product?->in_stock ?? false),
            // Surfaced so the cart can say "this changed since you added it"
            // instead of silently charging a different number.
            'priceChanged' => $this->priceChanged(),
            'addedPrice'   => intdiv($this->added_price_poisha, 100),
        ];
    }
}
