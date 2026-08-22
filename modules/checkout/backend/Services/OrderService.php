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
use Modules\Checkout\Models\OrderItem;
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
            $totalPoisha = $goodsAfterDiscount + $deliveryPoisha;

            // COD abuse guards, both phrased as things a human can act on.
            // Cash on delivery with one-tap checkout is how this shop sells,
            // and it is also how fake orders cost real courier fees: every
            // junk order that ships is money burned twice, outbound and back.
            $this->assertNotDuplicate($input['phone'], $totalPoisha);
            $this->assertUnderDailyCap($input['phone']);

            /* THE SPLIT.

               A basket holding both a thing on the shelf and a thing that has
               not landed becomes two orders: one that ships today, one that
               ships on arrival. The alternative was holding the in-stock item
               hostage for three weeks, which is a worse answer to a customer
               who ordered dates and saffron together.

               `placement_ref` is what remembers they were one basket. */
            $now   = $cart->items->reject(fn (CartItem $i) => $i->product->isPreorder());
            $later = $cart->items->filter(fn (CartItem $i) => $i->product->isPreorder());

            // Before anything is written: a pre-order cannot be bought on
            // trust. Named here rather than in assertAvailable() because it is
            // a fact about the PAYMENT, not about the product.
            $this->assertPreorderPayable($input['payment'], $later);

            /* Groups, in shipping order. The FIRST one carries the delivery
               charge and is what this method returns — it is the order the
               customer is shown on the confirmation page. When the whole
               basket is a pre-order there is only one group and it pays for
               its own delivery, which is right; it is only the second parcel
               of a split that rides free. */
            $groups = [];
            if ($now->isNotEmpty())   { $groups[] = ['items' => $now,   'shipsOn' => null]; }
            if ($later->isNotEmpty()) { $groups[] = ['items' => $later, 'shipsOn' => $this->latestArrival($later)]; }

            $placementRef = count($groups) > 1 ? $this->generatePlacementRef() : null;

            $orders = [];
            $discountLeft = $discountPoisha;

            foreach ($groups as $index => $group) {
                $isFirst = $index === 0;
                $isLast  = $index === count($groups) - 1;

                $groupSubtotal = $group['items']->sum(fn (CartItem $i) => $i->lineTotalPoisha());

                /* The discount, split between the two orders in proportion to
                   what each is worth — and the LAST group takes the remainder
                   rather than its own rounded share, so the two orders always
                   add up to exactly the discount that was granted. Money is
                   integer poisha here precisely so this cannot drift, and a
                   basket discount that quietly becomes a taka more or less
                   once split is an accounting problem, not a rounding detail.

                   ALLOCATED, NOT RECOMPUTED, and that is a deliberate choice.
                   Recomputing the promotion against each half would be more
                   principled for a code scoped to particular products — but it
                   can also come out LOWER than the figure the customer was
                   shown in the cart, because a minimum-spend threshold the
                   whole basket cleared may not be cleared by either half. A
                   split is our fulfilment decision, not theirs; it must never
                   cost them the discount they were quoted. Where the money
                   lands between the two orders is our own bookkeeping. */
                $groupDiscount = $isLast
                    ? $discountLeft
                    : intdiv($discountPoisha * $groupSubtotal, max(1, $subtotalPoisha));
                $discountLeft -= $groupDiscount;

                $groupDelivery = $isFirst ? $deliveryPoisha : 0;
                $groupTotal = max(0, $groupSubtotal - $groupDiscount) + $groupDelivery;

                $order = Order::create([
                    'order_number'  => $this->generateOrderNumber(),
                    'placement_ref' => $placementRef,
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
                    'delivery_charge_poisha' => $groupDelivery,

                    /* Snapshotted, not read back through the products later.
                       An order is a historical record: if the arrival slips a
                       fortnight next week, that must not silently rewrite what
                       this customer was promised at the moment they paid. */
                    'preorder_ships_on'      => $group['shipsOn'],

                    'subtotal_poisha' => $groupSubtotal,
                    'discount_poisha' => $groupDiscount,
                    'total_poisha'    => $groupTotal,
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

                foreach ($group['items'] as $item) {
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

                $orders[] = $order;
            }

            $order = $orders[0];

            // Burn the promo only now — not when the code was typed — or a
            // browsing customer exhausts a limited campaign without buying.
            if ($promo !== null) {
                $this->promotions->recordRedemption($promo);
            }

            $this->carts->clear($cart);

            /* The order that ships first. Its `placement_ref` is how the
               confirmation screen finds the sibling — deliberately not
               returned as a pair, because every caller of this method wants
               one order and changing that signature would touch all of them
               to serve a case most baskets never hit. */
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

            // isOrderable(), not in_stock — a pre-order is out of stock by
            // definition, and testing the column directly would refuse every
            // one of them here at the last moment.
            if (! $item->product->isOrderable()) {
                throw new RuntimeException(
                    $item->product->unavailableReason()
                        ?? "{$item->product->title} cannot be ordered right now.",
                );
            }

            $this->assertUnderPreorderLimit($item);
        }
    }

    /**
     * The cap that stops a container being sold three times over.
     *
     * The whole hazard of a pre-order is committing to more than is coming and
     * finding out six weeks later, when the shipment lands and there is not
     * enough of it. Checked HERE rather than when the item entered the cart,
     * for the same reason stock is: two people can both be holding the last
     * unit in a basket, and this is the point where that has to be settled.
     *
     * Counted from the order lines rather than decremented from a column,
     * deliberately. A counter has to be adjusted on cancel, on refund and on
     * every admin correction, and the day one of those is missed it says a
     * shipment is sold out when it is not. The orders are the real record.
     */
    private function assertUnderPreorderLimit(CartItem $item): void
    {
        $product = $item->product;
        $limit = $product->preorder_limit;

        if (! $product->isPreorder() || $limit === null) {
            return;
        }

        // Cancelled and spam orders release their claim; everything else,
        // including one merely awaiting payment, still holds it.
        $taken = (int) OrderItem::query()
            ->where('product_id', $product->id)
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['cancelled', 'spam']))
            ->sum('qty');

        if ($taken + $item->qty > $limit) {
            $left = max(0, $limit - $taken);

            throw new RuntimeException($left === 0
                ? "{$product->title} is fully pre-ordered. We will list it again when the shipment lands."
                : "Only {$left} of {$product->title} left in this shipment.");
        }
    }

    /**
     * Pre-orders are not sold on trust.
     *
     * Cash on delivery is how this shop sells and that is not in question — but
     * a pre-order asks us to hold scarce imported stock for weeks against a
     * promise, and a refusal at the door six weeks later is the worst version
     * of a problem this business already has. Nobody reserves a container for
     * free.
     *
     * Only the pre-order half is affected. A split basket can still pay cash
     * for the part that ships today; it is the same order form, and the
     * refusal names exactly which items are the problem.
     *
     * @param  \Illuminate\Support\Collection<int, CartItem>  $preorderItems
     */
    private function assertPreorderPayable(string $method, $preorderItems): void
    {
        if ($preorderItems->isEmpty() || $method !== 'cod') {
            return;
        }

        $names = $preorderItems
            ->map(fn (CartItem $i) => $i->product->title)
            ->join(', ', ' and ');

        throw new RuntimeException(
            "{$names} must be paid for in advance, because it has not arrived yet. "
            . 'Choose bKash, Nagad or card to complete this order.',
        );
    }

    /**
     * The day the whole pre-order can go out — the LATEST arrival among its
     * lines, not the earliest.
     *
     * Two pre-ordered products arriving three weeks apart ship together, and
     * promising the earlier date would be promising a parcel that cannot be
     * packed. The pessimistic date is the only honest one.
     *
     * @param  \Illuminate\Support\Collection<int, CartItem>  $items
     */
    private function latestArrival($items): ?string
    {
        $dates = $items
            ->map(fn (CartItem $i) => $i->product->available_from)
            ->filter()
            ->sort();

        return $dates->isEmpty() ? null : $dates->last()->toDateString();
    }

    /**
     * The token shared by orders written in one checkout.
     *
     * Short and random rather than sequential: it turns up in a confirmation
     * URL, and a guessable one would let anyone walk other people's orders —
     * the same reasoning as generateOrderNumber() below.
     */
    private function generatePlacementRef(): string
    {
        return 'P' . strtoupper(bin2hex(random_bytes(6)));
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
    /**
     * The same phone placing the same total twice inside ten minutes is,
     * overwhelmingly, one of two things: a double-tap the client-side guards
     * missed, or someone testing how many orders a script can create. A
     * customer genuinely reordering hits neither — a second identical order
     * ten minutes later goes through.
     *
     * Keyed on total rather than items because it needs no join and a spam
     * run repeats the same basket; a legitimate different order almost never
     * lands on the identical poisha total within the window.
     */
    private function assertNotDuplicate(string $phone, int $totalPoisha): void
    {
        $duplicate = Order::query()
            ->where('customer_phone', $this->normalisePhone($phone))
            ->where('total_poisha', $totalPoisha)
            ->where('created_at', '>=', now()->subMinutes(10))
            ->exists();

        if ($duplicate) {
            throw new RuntimeException(
                'You placed this exact order a few minutes ago — it is already on its way. '
                . 'Check the tracking page, or wait ten minutes if you really do want it twice.'
            );
        }
    }

    /**
     * Five COD orders from one phone in one day is not shopping. The cap is
     * generous for a household and a hard wall for the standard fake-order
     * attack (a rival feeding addresses into a shop to burn its courier fees).
     * Cancelled orders do not count against it — a customer whose orders WE
     * cancelled should not also lose the ability to order.
     */
    private function assertUnderDailyCap(string $phone): void
    {
        $today = Order::query()
            ->where('customer_phone', $this->normalisePhone($phone))
            ->where('status', '!=', 'cancelled')
            ->where('created_at', '>=', now()->startOfDay())
            ->count();

        if ($today >= 5) {
            throw new RuntimeException(
                "This phone number has reached today's order limit. "
                . 'Call us if you need a larger order — bulk is what our B2B desk is for.'
            );
        }
    }

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
