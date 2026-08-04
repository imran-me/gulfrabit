<?php

declare(strict_types=1);

namespace Modules\Checkout\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Cart\Models\Cart;
use Modules\Cart\Models\CartItem;
use Modules\Cart\Services\CartService;
use Modules\Cart\Services\PromotionService;
use Modules\Checkout\Models\Order;
use Modules\Delivery\Models\District;
use RuntimeException;

/**
 * Turning a cart into an order.
 *
 * This is the one place in the system where money becomes real, so it is also
 * the place that trusts the client least. **Every figure is recomputed here**
 * — goods subtotal from the products table, delivery from the district, the
 * discount from the promo rules. The request carries an address, a payment
 * method and a delivery choice; it carries no prices, and there are no fields
 * for it to smuggle any in.
 *
 * The whole thing runs in one transaction. A half-written order — lines saved
 * but totals wrong, or a cart cleared without an order — is far worse than a
 * failed checkout the customer can retry.
 */
final class OrderService
{
    public function __construct(
        private readonly CartService $carts,
        private readonly PromotionService $promotions,
    ) {
    }

    /**
     * @param array{
     *   name:string, phone:string, email:?string, address:string, area:?string,
     *   district:string, notes:?string, delivery:string, payment:string
     * } $input
     */
    public function placeFromCart(Cart $cart, array $input, ?int $userId = null): Order
    {
        return DB::transaction(function () use ($cart, $input, $userId): Order {
            // Lock the cart lines for the duration: without this, a second tab
            // adding an item mid-checkout could change the basket between the
            // total being computed and the order being written.
            $cart->load(['items' => fn ($q) => $q->lockForUpdate(), 'items.product']);

            if ($cart->items->isEmpty()) {
                throw new RuntimeException('Your cart is empty.');
            }

            $this->assertAvailable($cart);

            $district = District::query()->with('zone')->where('key', $input['district'])->firstOrFail();
            $zone = $district->zone;

            if (! $zone->is_active) {
                throw new RuntimeException('We do not currently deliver to that district.');
            }

            // The client sent a delivery choice; it only gets honoured if it is
            // actually available for this district. Express is Dhaka-only, and
            // a posted "express" for Sylhet must not buy a next-day promise.
            $chosenZone = $this->resolveZone($input['delivery'], $district->key, $zone);

            $subtotalPoisha = $cart->items->sum(fn (CartItem $i) => $i->lineTotalPoisha());
            $promo = $this->promotions->find($cart->promo_code);
            // The lines matter: a promotion scoped to particular products or
            // categories discounts only those, and returns zero without them.
            $discountPoisha = $promo?->discountPoisha(
                $subtotalPoisha,
                $this->carts->discountLines($cart),
            ) ?? 0;
            $deliveryPoisha = $chosenZone->charge_poisha;

            $goodsAfterDiscount = max(0, $subtotalPoisha - $discountPoisha);

            $order = Order::create([
                'order_number'  => $this->generateOrderNumber(),
                'user_id'       => $userId,

                'customer_name'  => $input['name'],
                'customer_phone' => $this->normalisePhone($input['phone']),
                'customer_email' => $input['email'] ?? null,

                'address_line'   => $input['address'],
                'area'           => $input['area'] ?? null,
                'district_name'  => $district->name,
                'district_key'   => $district->key,
                'delivery_notes' => $input['notes'] ?? null,

                'delivery_zone_key'      => $chosenZone->key,
                'delivery_eta'           => $chosenZone->eta_text,
                'delivery_charge_poisha' => $deliveryPoisha,

                'subtotal_poisha' => $subtotalPoisha,
                'discount_poisha' => $discountPoisha,
                'total_poisha'    => $goodsAfterDiscount + $deliveryPoisha,
                'promo_code'      => $promo?->code,

                'payment_method' => $input['payment'],
                // COD is owed on delivery, everything else awaits the gateway.
                // Neither is 'paid' — only a gateway callback may set that.
                'payment_status' => 'pending',
                'status'         => 'placed',

                // Which ad sold it, if one did. Reporting only — nothing
                // downstream branches on these. See the 2026_08_04 migration.
                'ad_source'      => $input['source'] ?? null,
                'pixel_event_id' => $input['eventId'] ?? null,
                'placed_at'      => now(),
            ]);

            foreach ($cart->items as $item) {
                $unit = $item->currentUnitPricePoisha();
                $order->items()->create([
                    'product_id'        => $item->product_id,
                    'sku'               => $item->product?->sku ?? 'unknown',
                    'title'             => $item->product?->title ?? 'Unknown product',
                    'brand'             => $item->product?->brand,
                    'image'             => $item->product?->image,
                    'variant'           => $item->variant,
                    'qty'               => $item->qty,
                    'unit_price_poisha' => $unit,
                    'line_total_poisha' => $unit * $item->qty,
                ]);
            }

            // Burn the promo only now — not when the code was typed — or a
            // browsing customer exhausts a limited campaign without buying.
            if ($promo !== null) {
                $this->promotions->recordRedemption($promo);
            }

            $this->carts->clear($cart);

            return $order->load('items');
        });
    }

    /**
     * Stock is not reserved when an item enters the cart, so two customers can
     * both hold the last unit. This is the point where that has to be caught.
     */
    private function assertAvailable(Cart $cart): void
    {
        foreach ($cart->items as $item) {
            if ($item->product === null || ! $item->product->is_active) {
                throw new RuntimeException('An item in your cart is no longer available.');
            }
            if (! $item->product->in_stock) {
                throw new RuntimeException("{$item->product->title} is out of stock.");
            }
        }
    }

    /**
     * Honour the customer's delivery choice only where it is genuinely offered;
     * otherwise fall back to the district's own zone.
     */
    private function resolveZone(string $requestedKey, string $districtKey, $districtZone)
    {
        if ($requestedKey === $districtZone->key) {
            return $districtZone;
        }

        if ($requestedKey === 'express' && $districtKey === 'dhaka') {
            $express = \Modules\Delivery\Models\DeliveryZone::query()
                ->active()->where('key', 'express')->first();

            if ($express !== null) {
                return $express;
            }
        }

        // Anything else — express requested for Sylhet, or a stale key — is
        // ignored in favour of what this district actually costs.
        return $districtZone;
    }

    /**
     * GR-2026-XXXXXX. Random rather than sequential: a guessable order number
     * lets anyone walk the guest tracking page and read other people's orders.
     */
    private function generateOrderNumber(): string
    {
        do {
            $number = 'GR-' . now()->year . '-' . strtoupper(Str::random(6));
        } while (Order::where('order_number', $number)->exists());

        return $number;
    }

    /** Store one canonical form so lookups by phone actually match. */
    private function normalisePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        // 8801712345678 -> 01712345678
        if (str_starts_with($digits, '88')) {
            $digits = substr($digits, 2);
        }

        return $digits;
    }
}
