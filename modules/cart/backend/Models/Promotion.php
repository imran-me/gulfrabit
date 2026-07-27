<?php

declare(strict_types=1);

namespace Modules\Cart\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A promo code and the rules that govern it.
 *
 * @property string $code
 * @property string $type  'pct' | 'flat'
 * @property int    $value percent for 'pct', poisha for 'flat'
 */
class Promotion extends Model
{
    use HasFactory;

    protected $fillable = [
        'code', 'label', 'type', 'value',
        'min_subtotal_poisha', 'max_discount_poisha',
        'starts_at', 'ends_at', 'usage_limit', 'used_count', 'is_active', 'is_public',
    ];

    protected function casts(): array
    {
        return [
            'starts_at'           => 'datetime',
            'ends_at'             => 'datetime',
            'is_active'           => 'boolean',
            'is_public'           => 'boolean',
            'value'               => 'integer',
            'min_subtotal_poisha' => 'integer',
            'max_discount_poisha' => 'integer',
            'usage_limit'         => 'integer',
            'used_count'          => 'integer',
        ];
    }

    /** Active, in-window, and not exhausted. */
    public function scopeRedeemable(Builder $q): Builder
    {
        $now = now();

        return $q->where('is_active', true)
            ->where(fn (Builder $w) => $w->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn (Builder $w) => $w->whereNull('ends_at')->orWhere('ends_at', '>=', $now))
            ->where(fn (Builder $w) => $w->whereNull('usage_limit')->orWhereColumn('used_count', '<', 'usage_limit'));
    }

    /**
     * Redeemable AND cleared for advertising.
     *
     * Separate from redeemable() on purpose: a code can be perfectly valid and
     * still have no business appearing on a product page. Everything the
     * storefront shows publicly goes through here, so publishing a code is one
     * deliberate flag rather than a consequence of it merely working.
     */
    public function scopePublic(Builder $q): Builder
    {
        return $q->redeemable()->where('is_public', true);
    }

    /**
     * Discount in poisha for a given goods subtotal.
     * Returns 0 when the basket does not qualify — the caller decides whether
     * that is a silent no-op or a message.
     */
    public function discountPoisha(int $subtotalPoisha): int
    {
        if ($subtotalPoisha < $this->min_subtotal_poisha) {
            return 0;
        }

        $discount = $this->type === 'pct'
            ? (int) floor($subtotalPoisha * $this->value / 100)
            : $this->value;

        if ($this->max_discount_poisha !== null) {
            $discount = min($discount, $this->max_discount_poisha);
        }

        // Never discount more than the goods are worth.
        return min($discount, $subtotalPoisha);
    }
}
