<?php

declare(strict_types=1);

namespace Modules\Cart\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;

/**
 * Spend this much, get that free.
 *
 * @property string $key
 * @property int    $threshold_poisha
 */
class GiftReward extends Model
{
    use HasFactory;

    protected $fillable = [
        'key', 'threshold_poisha', 'product_id', 'teaser',
        'starts_at', 'ends_at', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'threshold_poisha' => 'integer',
            'starts_at'        => 'datetime',
            'ends_at'          => 'datetime',
            'is_active'        => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function scopeLive(Builder $q): Builder
    {
        $now = now();

        return $q->where('is_active', true)
            ->where(fn (Builder $w) => $w->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn (Builder $w) => $w->whereNull('ends_at')->orWhere('ends_at', '>=', $now));
    }

    /**
     * Progress toward this reward for a given goods subtotal.
     *
     * Returned even when unmet — the whole mechanic depends on telling the
     * customer how much MORE to spend, which is the part that moves basket size.
     */
    public function progressFor(int $subtotalPoisha): array
    {
        $unlocked = $subtotalPoisha >= $this->threshold_poisha;

        return [
            'key'       => $this->key,
            'unlocked'  => $unlocked,
            'threshold' => intdiv($this->threshold_poisha, 100),
            'remaining' => $unlocked ? 0 : intdiv($this->threshold_poisha - $subtotalPoisha, 100),
            // Clamped: a basket well past the threshold must not render a
            // progress bar wider than its track.
            'percent'   => $this->threshold_poisha > 0
                ? min(100, (int) floor($subtotalPoisha / $this->threshold_poisha * 100))
                : 100,
            'teaser'    => $this->teaser,
            'label'     => $this->product?->title,
            'image'     => $this->product?->image,
            'sku'       => $this->product?->sku,
        ];
    }
}
