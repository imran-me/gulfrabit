<?php

declare(strict_types=1);

namespace Modules\Cart\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One thing a scoped promotion applies to — a category or a product.
 *
 * Exactly one of `category_id` / `product_id` is set on any row. Which one is
 * meaningful is decided by the parent promotion's `scope`, not by which column
 * happens to be filled: a promotion switched from 'products' to 'categories'
 * keeps its old product rows until they are replaced, and reading the wrong
 * column would apply a discount nobody configured.
 *
 * @property int|null $category_id
 * @property int|null $product_id
 */
class PromotionTarget extends Model
{
    protected $fillable = ['promotion_id', 'category_id', 'product_id'];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
