<?php

declare(strict_types=1);

namespace Modules\Cart\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Cart\Models\Cart;
use Modules\Cart\Models\CartItem;
use Modules\Cart\Models\GiftReward;
use Modules\Catalog\Models\Product;
use RuntimeException;

/**
 * Every cart rule lives here.
 *
 * The one that matters: **the client never sends a price.** It sends a SKU and
 * a quantity. Every figure in the returned totals is resolved server-side from
 * the products table. A cart that trusts a posted price is a cart that can be
 * bought for one taka.
 */
final class CartService
{
    public function __construct(
        private readonly PromotionService $promotions,
    ) {
    }

    /** Find or create the cart for a guest token or a user id. */
    public function resolve(?string $guestToken, ?int $userId): Cart
    {
        if ($userId !== null) {
            return Cart::firstOrCreate(['user_id' => $userId]);
        }

        if ($guestToken !== null) {
            $existing = Cart::where('guest_token', $guestToken)->first();
            if ($existing !== null) {
                return $existing;
            }
        }

        return Cart::create(['guest_token' => $guestToken ?? (string) Str::uuid()]);
    }

    /**
     * Fold a guest cart into the user's on login, then discard the guest one.
     * Wrapped in a transaction: a half-merged cart is worse than either half.
     */
    public function mergeGuestIntoUser(string $guestToken, int $userId): Cart
    {
        return DB::transaction(function () use ($guestToken, $userId): Cart {
            $userCart = Cart::firstOrCreate(['user_id' => $userId]);
            $guestCart = Cart::where('guest_token', $guestToken)->with('items')->first();

            if ($guestCart === null || $guestCart->is($userCart)) {
                return $userCart->load('items.product');
            }

            $userCart->mergeFrom($guestCart);
            $guestCart->delete();

            return $userCart->load('items.product');
        });
    }

    /**
     * Add a product by SKU. Adding something already in the cart increments the
     * existing line rather than creating a duplicate.
     */
    public function addItem(Cart $cart, string $sku, int $qty, ?string $variant = null): Cart
    {
        $product = Product::query()->active()->where('sku', $sku)->first();

        if ($product === null) {
            throw new RuntimeException("Unknown or unavailable product: {$sku}");
        }

        if (! $product->in_stock) {
            throw new RuntimeException("{$product->title} is out of stock.");
        }

        $line = $cart->items()
            ->where('product_id', $product->id)
            ->where('variant', $variant)
            ->first();

        if ($line !== null) {
            $line->qty = $this->clampQty($line->qty + $qty);
            $line->save();
        } else {
            $cart->items()->create([
                'product_id'         => $product->id,
                'variant'            => $variant,
                'qty'                => $this->clampQty($qty),
                'added_price_poisha' => $product->price_poisha,
            ]);
        }

        return $cart->load('items.product');
    }

    public function updateQty(Cart $cart, int $lineId, int $qty): Cart
    {
        $line = $cart->items()->whereKey($lineId)->firstOrFail();

        // Setting a line to zero is how the UI expresses "remove", so honour it
        // rather than clamping to 1 and leaving the item stuck in the cart.
        if ($qty <= 0) {
            $line->delete();
        } else {
            $line->qty = $this->clampQty($qty);
            $line->save();
        }

        return $cart->load('items.product');
    }

    public function removeItem(Cart $cart, int $lineId): Cart
    {
        $cart->items()->whereKey($lineId)->delete();

        return $cart->load('items.product');
    }

    public function clear(Cart $cart): Cart
    {
        $cart->items()->delete();
        $cart->update(['promo_code' => null]);

        return $cart->load('items');
    }

    public function applyPromo(Cart $cart, ?string $code): Cart
    {
        // Store only the CODE. The discount is recomputed on every read, so a
        // promo that expires or stops qualifying stops applying by itself.
        $cart->update(['promo_code' => $code ? strtoupper($code) : null]);

        return $cart->load('items.product');
    }

    /**
     * Goods subtotal in poisha — exact.
     *
     * Callers that need to compare against a promo's minimum spend must use
     * this, NOT the taka figure from toStorefrontArray(): that one is
     * intdiv()'d to whole taka, so multiplying it back by 100 loses up to 99
     * poisha and can flip a basket across a minimum-spend boundary.
     */
    public function subtotalPoisha(Cart $cart): int
    {
        $cart->loadMissing('items.product');

        return $cart->items->sum(fn (CartItem $i) => $i->lineTotalPoisha());
    }

    /**
     * The full cart payload — lines plus every total, all server-computed.
     *
     * Delivery is deliberately NOT included. It depends on the district, which
     * the cart does not know, and modules/delivery owns that price. The cart
     * quotes goods only; checkout adds delivery.
     */
    public function toStorefrontArray(Cart $cart): array
    {
        $cart->loadMissing('items.product');

        $items = $cart->items->map(fn (CartItem $i) => $i->toStorefrontArray())->all();

        $subtotalPoisha = $this->subtotalPoisha($cart);
        $discountPoisha = $this->promotions->discountPoisha($cart->promo_code, $subtotalPoisha);

        return [
            'items'    => $items,
            'count'    => $cart->items->sum('qty'),
            'promo'    => $cart->promo_code,
            'totals'   => [
                'subtotal' => intdiv($subtotalPoisha, 100),
                'discount' => intdiv($discountPoisha, 100),
                // max(0) guards a flat promo larger than the basket; a negative
                // goods total would become free money at checkout.
                'total'    => intdiv(max(0, $subtotalPoisha - $discountPoisha), 100),
            ],
            'notices'  => $this->notices($cart),
            // Progress is returned even when unmet — telling the customer how
            // much MORE to spend is the part of this mechanic that works.
            'gift'     => $this->giftProgress($subtotalPoisha),
        ];
    }

    /**
     * The live gift threshold and how close this basket is to it.
     *
     * Lowest threshold first, so a customer chasing the nearest reward is shown
     * that one rather than a distant bigger prize they will not reach.
     */
    private function giftProgress(int $subtotalPoisha): ?array
    {
        $reward = GiftReward::query()
            ->live()
            ->with('product:id,sku,title,image')
            ->orderBy('threshold_poisha')
            ->first();

        return $reward?->progressFor($subtotalPoisha);
    }

    /**
     * The gift threshold as an OFFER RULE, with no basket attached.
     *
     * giftProgress() answers "how close is this cart"; this answers "what is on
     * offer at all", which is what a product page needs before anyone has a
     * cart. Returned as a list so the caller can spread it — an empty array
     * when no gift is running reads better at the call site than a null check
     * around a splat.
     *
     * @return array<int, array<string, mixed>>
     */
    public function activeGiftOffer(): array
    {
        $reward = GiftReward::query()
            ->live()
            ->with('product:id,sku,title,image,price_poisha')
            ->orderBy('threshold_poisha')
            ->first();

        if ($reward?->product === null) {
            // A gift whose product has been delisted is not an offer, it is a
            // promise nobody can keep. Say nothing rather than name it.
            return [];
        }

        return [[
            'kind'      => 'gift',
            'label'     => $reward->product->title,
            'teaser'    => $reward->teaser,
            'minSpend'  => intdiv($reward->threshold_poisha, 100),
            'valueTaka' => intdiv($reward->product->price_poisha, 100),
            'image'     => $reward->product->image,
            'sku'       => $reward->product->sku,
        ]];
    }

    /** @return array<int, string> things the customer should be told, not hidden */
    private function notices(Cart $cart): array
    {
        $notices = [];

        foreach ($cart->items as $item) {
            if ($item->product === null || ! $item->product->is_active) {
                $notices[] = 'An item in your cart is no longer available.';
                continue;
            }
            if (! $item->product->in_stock) {
                $notices[] = "{$item->product->title} is now out of stock.";
            }
            if ($item->priceChanged()) {
                $notices[] = "The price of {$item->product->title} changed since you added it.";
            }
        }

        return array_values(array_unique($notices));
    }

    private function clampQty(int $qty): int
    {
        return max(1, min($qty, CartItem::MAX_QTY));
    }
}
