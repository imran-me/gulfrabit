<?php

declare(strict_types=1);

namespace Modules\Catalog\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Somebody waiting for a product to become buyable.
 *
 * Covers both a sold-out product and one that has not arrived yet, because
 * from the customer's side those are the same request. See the migration.
 */
class StockAlert extends Model
{
    protected $table = 'stock_alerts';

    protected $fillable = ['product_id', 'phone', 'notified_at'];

    protected function casts(): array
    {
        return ['notified_at' => 'datetime'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** Everyone still owed a message. */
    public function scopeWaiting(Builder $q): Builder
    {
        return $q->whereNull('notified_at');
    }
}
