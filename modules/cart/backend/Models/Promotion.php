<?php

declare(strict_types=1);

namespace Modules\Cart\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

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

    /* Deleting a code takes it off the panel and out of every checkout; it
       leaves its promotion_targets rows attached, so restoring returns the
       code AND the scope somebody chose product by product. Hard deleting
       cascaded those away. */
    use SoftDeletes;

    protected $fillable = [
        'code', 'label', 'type', 'value', 'scope',
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

    /**
     * The categories or products this applies to. Empty when scope is 'all'.
     *
     * A plain hasMany rather than two belongsToMany relations: the rows are
     * read together and filtered by scope, and one relation means one query
     * instead of two on every cart recalculation.
     */
    public function targets(): HasMany
    {
        return $this->hasMany(PromotionTarget::class);
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
    public function discountPoisha(int $subtotalPoisha, ?array $lines = null): int
    {
        // The minimum spend is judged on the WHOLE basket, not on the eligible
        // part of it. "Spend ৳2000 to use this code" is what a customer reads,
        // and testing it against a subset would refuse baskets that plainly
        // meet the stated condition.
        if ($subtotalPoisha < $this->min_subtotal_poisha) {
            return 0;
        }

        $base = $this->eligiblePoisha($subtotalPoisha, $lines);

        if ($base <= 0) {
            return 0;
        }

        $discount = $this->type === 'pct'
            ? (int) floor($base * $this->value / 100)
            : $this->value;

        if ($this->max_discount_poisha !== null) {
            $discount = min($discount, $this->max_discount_poisha);
        }

        // Never discount more than the goods it applies to are worth. A ৳500
        // flat code against a ৳300 eligible item takes ৳300, not ৳500 off the
        // rest of the basket.
        return min($discount, $base);
    }

    /**
     * How much of the basket this promotion actually applies to.
     *
     * @param array<int, array{product_id?:int|null, category_id?:int|null, total_poisha:int}>|null $lines
     */
    private function eligiblePoisha(int $subtotalPoisha, ?array $lines): int
    {
        if ($this->scope === 'all') {
            return $subtotalPoisha;
        }

        // FAILS CLOSED. A scoped promotion whose caller did not supply the
        // basket lines discounts nothing, rather than falling back to the
        // whole subtotal. Over-discounting is the expensive direction to be
        // wrong in, and a missing discount is visible to the customer
        // immediately while an over-applied one is not visible to anyone.
        if ($lines === null) {
            return 0;
        }

        $targets = $this->relationLoaded('targets')
            ? $this->targets
            : $this->targets()->get();

        $ids = $this->scope === 'products'
            ? $targets->pluck('product_id')->filter()->all()
            : $targets->pluck('category_id')->filter()->all();

        if ($ids === []) {
            return 0;      // configured to apply to a set that is empty
        }

        $key = $this->scope === 'products' ? 'product_id' : 'category_id';
        $wanted = array_flip($ids);

        $sum = 0;
        foreach ($lines as $line) {
            if (isset($line[$key], $wanted[$line[$key]])) {
                $sum += (int) $line['total_poisha'];
            }
        }

        return $sum;
    }
}
