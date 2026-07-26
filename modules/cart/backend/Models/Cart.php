<?php

declare(strict_types=1);

namespace Modules\Cart\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A cart, belonging to a guest token or a user.
 *
 * @property string|null $guest_token
 * @property int|null    $user_id
 * @property string|null $promo_code
 */
class Cart extends Model
{
    use HasFactory;

    protected $fillable = ['guest_token', 'user_id', 'promo_code'];

    public function items(): HasMany
    {
        // Stable ordering: without it the cart reshuffles between requests and
        // the customer thinks lines have moved or vanished.
        return $this->hasMany(CartItem::class)->orderBy('id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class);
    }

    public function isGuest(): bool
    {
        return $this->user_id === null;
    }

    /**
     * Merge another cart into this one, then the caller deletes the source.
     * Used on login: the guest cart folds into the user's existing cart.
     *
     * Quantities are ADDED rather than overwritten. If someone put 2 of
     * something in while logged out and already had 1 saved, they meant to buy
     * 3, and silently dropping either is worse than a quantity they can edit.
     */
    public function mergeFrom(self $other): void
    {
        foreach ($other->items as $incoming) {
            $existing = $this->items()
                ->where('product_id', $incoming->product_id)
                ->where('variant', $incoming->variant)
                ->first();

            if ($existing !== null) {
                $existing->qty = min($existing->qty + $incoming->qty, CartItem::MAX_QTY);
                $existing->save();
                continue;
            }

            $this->items()->create([
                'product_id'         => $incoming->product_id,
                'variant'            => $incoming->variant,
                'qty'                => $incoming->qty,
                'added_price_poisha' => $incoming->added_price_poisha,
            ]);
        }

        // The guest's promo only carries over if the user had not entered one.
        if ($this->promo_code === null && $other->promo_code !== null) {
            $this->promo_code = $other->promo_code;
            $this->save();
        }

        $this->load('items');
    }
}
