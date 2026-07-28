<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The running total for one product in one warehouse.
 *
 * Maintained only by StockService, inside the same transaction as the movement
 * that caused it — so it can always be rebuilt from stock_movements, and a
 * disagreement is a bug with an audit trail rather than a mystery.
 *
 * @property int $qty_on_hand
 * @property int $qty_reserved
 */
class StockLevel extends Model
{
    protected $fillable = ['product_id', 'warehouse_id', 'qty_on_hand', 'qty_reserved', 'reorder_level'];

    protected $casts = [
        'qty_on_hand'   => 'integer',
        'qty_reserved'  => 'integer',
        'reorder_level' => 'integer',
    ];

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    /** What can still be promised to a customer. */
    public function available(): int
    {
        return $this->qty_on_hand - $this->qty_reserved;
    }

    /** At or below the level where somebody should be reordering. */
    public function scopeLow(Builder $q): Builder
    {
        return $q->whereColumn('qty_on_hand', '<=', 'reorder_level');
    }

    public function toAdminArray(): array
    {
        return [
            'warehouse'    => $this->warehouse?->name,
            'onHand'       => $this->qty_on_hand,
            'reserved'     => $this->qty_reserved,
            'available'    => $this->available(),
            'reorderLevel' => $this->reorder_level,
            // Reported rather than inferred in the client, so every screen
            // agrees on what "low" means.
            'isLow'        => $this->qty_on_hand <= $this->reorder_level,
        ];
    }
}
