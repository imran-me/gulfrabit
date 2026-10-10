<?php

declare(strict_types=1);

namespace Modules\Checkout\Services;

use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Cart\Models\Cart;
use Modules\Cart\Models\CartItem;
use Modules\Cart\Models\Promotion;
use Modules\Cart\Services\CartService;
use Modules\Cart\Services\PromotionService;
use Modules\Catalog\Models\Product;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Delivery\Models\DeliveryZone;
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

            $order = $this->capture($cart, $input, $userId);

            $this->carts->clear($cart);

            return $order;
        });
    }

    /**
     * An order somebody on the staff typed in — taken on a call, from a
     * WhatsApp message, off a comment under a post.
     *
     * THERE IS NO SECOND PRICE LIST. The lines become a basket that is never
     * saved — the same Cart and CartItem models, built in memory — and that
     * basket goes through capture(), which is the method a website order goes
     * through. So a phone order is priced, split, snapshotted and numbered by
     * exactly the code that handles every other order, and it lands in the
     * same pipeline: the same stages, the same slip, the same courier booking.
     *
     * The staff member chooses the products, the packs and the quantities.
     * They do not choose a price, a discount or a delivery charge any more
     * than a customer does — there is still no field for one.
     *
     * @param array<int, array{sku:string, qty:int, variant?:?string}> $lines
     * @param array{
     *   name:string, phone:string, email:?string, address:?string, area:?string,
     *   district:string, notes:?string, delivery:?string, payment:string,
     *   promo:?string, channel:string
     * } $input
     */
    public function placeManual(array $lines, array $input): Order
    {
        return DB::transaction(function () use ($lines, $input): Order {
            $basket = $this->basket($lines, $input['promo'] ?? null);

            // The storefront refuses a dead code when it is typed, at
            // POST /cart/promo, long before the order. This path has no such
            // earlier step, so the same refusal happens here: a code that does
            // not apply must stop the order rather than quietly charge the
            // undiscounted total the customer was not quoted on the phone.
            $problem = $this->promoProblem($basket);

            if ($problem !== null) {
                throw new RuntimeException($problem);
            }

            return $this->capture($basket, $input, null, vouched: true);
        });
    }

    /**
     * What a manual order WOULD come to, without writing anything.
     *
     * The order form asks this every time a line, a pack, a district or a code
     * changes, and paints the answer. The browser adds nothing up: the figures
     * it shows before Place order are produced by goods() and deliveryFor(),
     * which are the two methods capture() charges from.
     *
     * Product problems — unlisted, out of stock, a pack that does not exist —
     * are thrown, exactly as they would be on placing, so the form can say so
     * while the customer is still on the line. A promo code that does not
     * apply is NOT thrown: it comes back as `promoProblem` beside totals
     * worked out without it, because "that code is no use here, it is ৳1,520"
     * is an answer the person on the phone can give straight away.
     *
     * @param array<int, array{sku:string, qty:int, variant?:?string}> $lines
     * @param array{district?:?string, delivery?:?string, promo?:?string, payment?:?string} $input
     * @return array{
     *   items: EloquentCollection<int, CartItem>,
     *   subtotalPoisha: int, discountPoisha: int, deliveryPoisha: ?int, totalPoisha: int,
     *   promoCode: ?string, promoProblem: ?string,
     *   zone: ?DeliveryZone, zones: array<int, DeliveryZone>,
     *   shipsOn: ?string, splits: bool
     * }
     */
    public function quoteManual(array $lines, array $input): array
    {
        $basket = $this->basket($lines, $input['promo'] ?? null);

        $this->assertAvailable($basket);

        $goods = $this->goods($basket);

        // No district yet is an ordinary state of a half-filled form, not an
        // error: the goods are priced and the delivery line waits.
        $delivery = empty($input['district'])
            ? null
            : $this->deliveryFor($input['district'], $input['delivery'] ?? null);

        $later = $basket->items->filter(fn (CartItem $i) => $i->product->isPreorder());

        if (! empty($input['payment'])) {
            $this->assertPreorderPayable($input['payment'], $later);
        }

        $deliveryPoisha = $delivery === null ? null : $delivery['zone']->charge_poisha;

        return [
            'items'          => $basket->items,
            'subtotalPoisha' => $goods['subtotalPoisha'],
            'discountPoisha' => $goods['discountPoisha'],
            'deliveryPoisha' => $deliveryPoisha,
            'totalPoisha'    => max(0, $goods['subtotalPoisha'] - $goods['discountPoisha']) + ($deliveryPoisha ?? 0),
            // The code as typed, found or not — the form has to be able to
            // say which code it is talking about when it says one is dead.
            'promoCode'      => $basket->promo_code,
            'promoProblem'   => $this->promoProblem($basket),
            'zone'           => $delivery['zone'] ?? null,
            'zones'          => $delivery['offered'] ?? [],
            // A pre-order line turns one order into two, or holds the whole
            // order back. Either way the person on the phone has to say so.
            'shipsOn'        => $later->isEmpty() ? null : $this->latestArrival($later),
            'splits'         => $later->isNotEmpty() && $later->count() < $basket->items->count(),
        ];
    }

    /**
     * Write the order — the half of placing that does not care where the
     * basket came from.
     *
     * placeFromCart() hands this the customer's saved cart; placeManual()
     * hands it one built in memory from what a member of staff typed. Both are
     * a Cart holding CartItems with their products loaded, and nothing below
     * can tell them apart, which is the point.
     *
     * `$vouched` is the one difference: true when a person on the staff is
     * placing it on a customer's behalf. See the abuse guards below.
     *
     * Must be called inside a transaction. A half-written order — lines saved
     * but totals wrong — is far worse than a failed one that can be retried.
     */
    private function capture(Cart $cart, array $input, ?int $userId, bool $vouched = false): Order
    {
        $this->assertAvailable($cart);

        ['district' => $district, 'zone' => $chosenZone] =
            $this->deliveryFor($input['district'], $input['delivery'] ?? null);

        ['subtotalPoisha' => $subtotalPoisha, 'promo' => $promo, 'discountPoisha' => $discountPoisha] =
            $this->goods($cart);

        $deliveryPoisha = $chosenZone->charge_poisha;

        $goodsAfterDiscount = max(0, $subtotalPoisha - $discountPoisha);
        $totalPoisha = $goodsAfterDiscount + $deliveryPoisha;

        // COD abuse guards, both phrased as things a human can act on.
        // Cash on delivery with one-tap checkout is how this shop sells,
        // and it is also how fake orders cost real courier fees: every
        // junk order that ships is money burned twice, outbound and back.
        //
        // NOT FOR AN ORDER A MEMBER OF STAFF TYPED IN. Both guards exist
        // to stop a stranger's script; neither has anything to say to a
        // person on the shop's own payroll who has just spoken to the
        // customer. The daily cap's own refusal tells the customer to
        // ring us for a larger order — and this is where that call ends
        // up, so applying the cap here would refuse the very order it
        // asked for.
        if (! $vouched) {
            $this->assertNotDuplicate($input['phone'], $totalPoisha);
            $this->assertUnderDailyCap($input['phone']);
        }

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

                /* How it reached us — set only by placeManual(). The
                   storefront's request has no such field, so a website
                   order never names the column and takes its default;
                   which also means a deploy that has not yet run the
                   2026_10_10 migration still takes website orders. */
                ...(isset($input['channel']) ? ['channel' => $input['channel']] : []),
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

        /* The order that ships first. Its `placement_ref` is how the
           confirmation screen finds the sibling — deliberately not
           returned as a pair, because every caller of this method wants
           one order and changing that signature would touch all of them
           to serve a case most baskets never hit. */
        return $order->load('items');
    }

    /**
     * Turn typed lines into a basket that was never saved.
     *
     * The same models a customer's cart is made of, with the relations set by
     * hand instead of loaded — so every rule written against a cart (what is
     * available, what it costs, what a promotion takes off it, where it
     * splits) applies without knowing the difference, and nothing is written
     * to `carts` for an order no customer ever had a cart for.
     *
     * STRICTER THAN THE STOREFRONT ABOUT PACKS, and it can afford to be: every
     * label here was picked from a list the server sent a moment ago. So a
     * pack that does not exist, or is out of stock, is refused by name rather
     * than priced as the default — which is the bug express-page.js describes
     * at length, arriving by telephone.
     *
     * @param array<int, array{sku:string, qty:int, variant?:?string}> $lines
     */
    private function basket(array $lines, ?string $promoCode): Cart
    {
        if ($lines === []) {
            throw new RuntimeException('Add at least one product to the order.');
        }

        // active(), the scope the storefront's own add-to-cart uses: listed,
        // not archived, in a category that is switched on. What a customer
        // cannot buy on the site, staff cannot sell them around it either.
        $products = Product::query()
            ->active()
            ->whereIn('sku', array_column($lines, 'sku'))
            ->get()
            ->keyBy(fn (Product $p): string => strtolower($p->sku));

        /** @var array<string, CartItem> $items */
        $items = [];

        foreach ($lines as $line) {
            $product = $products->get(strtolower((string) $line['sku']));

            if ($product === null) {
                throw new RuntimeException(
                    "{$line['sku']} is not on sale — it is unlisted, archived or gone. "
                    . 'List it on the Products screen first, or choose something else.',
                );
            }

            $variant = $this->packFor($product, $line['variant'] ?? null);
            $key = $product->id . '|' . ($variant ?? '');

            // The same product in the same pack twice is one line of both,
            // which is what the cart's unique key makes of it too.
            if (isset($items[$key])) {
                $items[$key]->qty += (int) $line['qty'];

                continue;
            }

            $item = new CartItem([
                'product_id'         => $product->id,
                'variant'            => $variant,
                'qty'                => (int) $line['qty'],
                'added_price_poisha' => $product->pricePoishaFor($variant),
            ]);
            $item->setRelation('product', $product);

            $items[$key] = $item;
        }

        foreach ($items as $item) {
            $max = CartItem::maxQtyFor($item->product->moq);

            // Refused, not clamped. The cart clamps because a stepper can
            // overshoot; a number typed by staff from a phone call that came
            // out as 99 without a word would be an order nobody agreed to.
            if ($item->qty > $max) {
                throw new RuntimeException(
                    "{$item->product->title}: {$max} is the most one order can hold.",
                );
            }
        }

        $code = strtoupper(trim((string) $promoCode));

        $basket = new Cart(['promo_code' => $code === '' ? null : $code]);
        $basket->setRelation('items', new EloquentCollection(array_values($items)));

        return $basket;
    }

    /**
     * Which pack a typed line means, in the shop's own spelling — or null for
     * a product that has nothing to choose.
     *
     * No pack named on a product with several records the one the shop
     * preselects, so an order can never reach the warehouse with the size
     * missing. That is the rule resolveVariant() applies on the express page,
     * kept here so the two ways of ordering one product agree.
     */
    private function packFor(Product $product, ?string $label): ?string
    {
        $packs = $product->variantsTaka();
        $label = trim((string) $label);

        if ($label === '') {
            if (count($packs) < 2) {
                return null;
            }

            $label = (string) ($product->variantRow($product->default_variant)['label'] ?? $packs[0]['label']);
        }

        $row = $product->variantRow($label);

        if ($row === null) {
            throw new RuntimeException("{$product->title} has no pack called “{$label}”.");
        }

        if (! ($row['in_stock'] ?? true)) {
            throw new RuntimeException("The {$row['label']} pack of {$product->title} is out of stock.");
        }

        return (string) $row['label'];
    }

    /**
     * What the goods come to, and what a promotion takes off them.
     *
     * @return array{subtotalPoisha:int, promo:?Promotion, discountPoisha:int}
     */
    private function goods(Cart $cart): array
    {
        $subtotalPoisha = $cart->items->sum(fn (CartItem $i) => $i->lineTotalPoisha());
        $promo = $this->promotions->find($cart->promo_code);
        // The lines matter: a promotion scoped to particular products or
        // categories discounts only those, and returns zero without them.
        $discountPoisha = $promo?->discountPoisha(
            $subtotalPoisha,
            $this->carts->discountLines($cart),
        ) ?? 0;

        return [
            'subtotalPoisha' => $subtotalPoisha,
            'promo'          => $promo,
            'discountPoisha' => $discountPoisha,
        ];
    }

    /**
     * Why the code on this basket takes nothing off — or null when it does, or
     * when there is no code.
     *
     * Three situations, three sentences, for the reason the cart gives them
     * three: only "not a live code" is a dead end. The other two are things
     * the person on the phone can fix by adding an item.
     */
    private function promoProblem(Cart $cart): ?string
    {
        $code = $cart->promo_code;

        if ($code === null) {
            return null;
        }

        $check = $this->promotions->validate(
            $code,
            $this->carts->subtotalPoisha($cart),
            $this->carts->discountLines($cart),
        );

        if ($check['valid']) {
            return null;
        }

        return match ($check['reason']) {
            'min_subtotal' => "{$code} needs ৳ " . number_format((int) ($check['minSpend'] ?? 0))
                . ' of goods before it applies.',
            'not_eligible' => "{$code} does not cover anything in this order.",
            default        => "{$code} is not a live code.",
        };
    }

    /**
     * Where the parcel is going, how it gets there, and the other ways it
     * could.
     *
     * @return array{district: District, zone: DeliveryZone, offered: array<int, DeliveryZone>}
     */
    private function deliveryFor(string $districtKey, ?string $requestedKey): array
    {
        $district = District::query()->with('zone')->where('key', $districtKey)->firstOrFail();
        $zone = $district->zone;

        if (! $zone->is_active) {
            throw new RuntimeException('We do not currently deliver to that district.');
        }

        $offered = $this->zonesFor($district->key, $zone);

        return [
            'district' => $district,
            // The client sent a delivery choice; it only gets honoured if it is
            // actually available for this district. Express is Dhaka-only, and
            // a posted "express" for Sylhet must not buy a next-day promise.
            'zone'     => $this->resolveZone($requestedKey, $offered),
            'offered'  => $offered,
        ];
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
     * Every way a parcel can reach this district — its own zone first, which
     * is the one charged when nothing else is asked for.
     *
     * The single statement of "express is Dhaka-only". resolveZone() honours a
     * request from this list, and the manual order form draws its delivery
     * choices from it, so the panel cannot offer a service the order would
     * then be refused.
     *
     * @return array<int, DeliveryZone>
     */
    private function zonesFor(string $districtKey, DeliveryZone $districtZone): array
    {
        $zones = [$districtZone];

        if ($districtKey === 'dhaka') {
            $express = DeliveryZone::query()->active()->where('key', 'express')->first();

            if ($express !== null && $express->key !== $districtZone->key) {
                $zones[] = $express;
            }
        }

        return $zones;
    }

    /**
     * Honour the customer's delivery choice only where it is genuinely offered;
     * otherwise fall back to the district's own zone.
     *
     * @param array<int, DeliveryZone> $offered  from zonesFor(), district zone first
     */
    private function resolveZone(?string $requestedKey, array $offered): DeliveryZone
    {
        foreach ($offered as $zone) {
            if ($zone->key === $requestedKey) {
                return $zone;
            }
        }

        // Anything else — express requested for Sylhet, or a stale key — is
        // ignored in favour of what this district actually costs.
        return $offered[0];
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
