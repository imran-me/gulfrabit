<?php

declare(strict_types=1);

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;

/**
 * One purchased line — a snapshot, not a lookup.
 *
 * Every display field is stored on the row. product_id exists only for
 * reporting and "buy it again" links, and is nullable: delisting a product must
 * never damage the record of an order that contained it.
 */
class OrderItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id', 'product_id', 'sku', 'title', 'brand', 'image',
        'variant', 'qty', 'unit_price_poisha', 'line_total_poisha',
    ];

    protected function casts(): array
    {
        return [
            'qty'               => 'integer',
            'unit_price_poisha' => 'integer',
            'line_total_poisha' => 'integer',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** May be null if the product was deleted after purchase. */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function toStorefrontArray(): array
    {
        return [
            'id'      => $this->sku,
            'title'   => $this->title,
            'brand'   => $this->brand,
            'image'   => $this->image,
            'variant' => $this->variant,
            'qty'     => $this->qty,
            'price'   => intdiv($this->unit_price_poisha, 100),
            'lineTotal' => intdiv($this->line_total_poisha, 100),
        ];
    }
}
