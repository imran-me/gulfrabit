<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Admin\Models\OrderNote;
use Modules\Admin\Requests\OrderQuoteRequest;
use Modules\Admin\Requests\OrderStoreRequest;
use Modules\Cart\Models\CartItem;
use Modules\Catalog\Models\Product;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Services\OrderFulfilmentService;
use Modules\Checkout\Services\OrderService;
use Modules\Delivery\Models\DeliveryZone;
use RuntimeException;

/**
 * Typing in an order that did not come through the website.
 *
 * A customer rings, or writes on WhatsApp, or answers a post — and until this
 * controller existed, that order lived in a notebook, because the only thing
 * able to write a row into `orders` was the storefront's checkout. It could
 * not be given a slip, booked with a courier, texted, counted or found again.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not a second way of pricing an order. Every figure comes from
 * OrderService, in the checkout module, by the route a website order takes;
 * this class shapes HTTP, says who is asking, and writes down that a person
 * did the typing. Same reasoning as AdminOrderController: the rules about
 * orders live with the orders.
 *
 * Kept apart from AdminOrderController because that one is about orders that
 * exist, and everything here happens before one does.
 */
class AdminOrderEntryController extends Controller
{
    /**
     * How each channel reads in the middle of a sentence.
     *
     * Only for the two records this controller writes — the note and the
     * confirmation — which are composed here rather than in the browser so
     * that the timeline says the same thing whoever is reading it. The labels
     * on pills and dropdowns are the panel's, in order-stages.js.
     */
    private const TAKEN = [
        'phone'     => 'by phone',
        'whatsapp'  => 'on WhatsApp',
        'messenger' => 'on Messenger',
        'instagram' => 'on Instagram',
        'other'     => 'directly',
    ];

    public function __construct(
        private readonly OrderService $orders,
        private readonly OrderFulfilmentService $fulfilment,
    ) {
    }

    /**
     * GET /api/admin/orders/products
     *
     * What can be sold right now, searched by name, SKU or brand.
     *
     * WHY NOT /api/admin/products. That endpoint is behind `products.view`,
     * and it returns cost and margin. The person on the phone is most often an
     * Employee account, which holds neither — deliberately: the shop floor
     * does not see what the shop paid. So taking an order needed its own
     * reading of the catalogue, behind the permission it is actually part of,
     * carrying what a sale needs and nothing a sale does not.
     *
     * Out-of-stock products ARE returned, marked. "Do you have the 1 kg?" is a
     * question a caller asks, and "no, only 500 g" is an answer the list
     * should be able to give without anybody leaving the screen.
     */
    public function products(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q'       => ['sometimes', 'nullable', 'string', 'max:64'],
            'perPage' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);

        // active(): listed, not archived, in a category that is switched on —
        // the same set OrderService::basket() will accept, so the picker never
        // offers something the order would then refuse as unlisted.
        $query = Product::query()->active()->orderBy('title')->orderBy('id');

        if (! empty($data['q'])) {
            $term = trim($data['q']);
            $query->where(fn ($w) => $w->where('title', 'like', "%{$term}%")
                ->orWhere('sku', 'like', "%{$term}%")
                ->orWhere('brand', 'like', "%{$term}%"));
        }

        return response()->json([
            'data' => $query->limit($data['perPage'] ?? 12)->get()
                ->map(fn (Product $p): array => [
                    'sku'       => $p->sku,
                    'title'     => $p->title,
                    'brand'     => $p->brand,
                    'image'     => $p->image,
                    'priceTaka' => $p->priceTaka(),
                    // Always true here — the scope above guarantees it. Sent
                    // because the shared picker marks a row "unlisted" when
                    // this is absent, and every row here is listed.
                    'isActive'  => true,

                    // Decided by the server's clock and the server's rules,
                    // for the reason toStorefrontArray() gives: a browser must
                    // not work out for itself whether something has landed.
                    'orderable'     => $p->isOrderable(),
                    'unavailable'   => $p->unavailableReason(),
                    'isPreorder'    => $p->isPreorder(),
                    'availableFrom' => $p->available_from?->toDateString(),

                    'maxQty'         => CartItem::maxQtyFor($p->moq),
                    'defaultVariant' => $p->default_variant,
                    // Label, price and whether that pack is on the shelf. No
                    // stock counts: variantsTaka() is already the boundary
                    // that keeps those out, and this reads through it.
                    'variants' => array_map(fn (array $v): array => [
                        'label'     => $v['label'],
                        'priceTaka' => $v['price'],
                        'inStock'   => $v['inStock'],
                    ], $p->variantsTaka()),
                ])
                ->all(),
        ]);
    }

    /**
     * POST /api/admin/orders/quote
     *
     * What the order being typed would come to. Writes nothing.
     *
     * The form calls this on every change and paints the answer, so the total
     * read out to a customer on the phone is the total the order will carry —
     * produced by the methods that will charge it, not by arithmetic in a
     * browser that would need to learn about packs, promotions and zones.
     */
    public function quote(OrderQuoteRequest $request): JsonResponse
    {
        if ($refused = $this->mayNotGive($request)) {
            return $refused;
        }

        try {
            $quote = $this->orders->quoteManual($request->validated('lines'), $request->validated());
        } catch (RuntimeException $e) {
            // Out of stock, unlisted, a pack that is gone, a district we do
            // not deliver to. All things the person typing can act on.
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => [
            // In the order the server holds them, which is the order they were
            // sent in with duplicates folded together — so the form can match
            // a line to its price by sku and pack, never by position.
            'lines' => $quote['items']->map(fn (CartItem $i): array => [
                'sku'      => $i->product->sku,
                'variant'  => $i->variant,
                'qty'      => $i->qty,
                'unitTaka' => intdiv($i->currentUnitPricePoisha(), 100),
                'lineTaka' => intdiv($i->lineTotalPoisha(), 100),
            ])->values()->all(),

            'totals' => [
                'subtotalTaka' => intdiv($quote['subtotalPoisha'], 100),
                // The coupon's alone. What was given by hand is its own line,
                // on this form and on every screen the order is later read on.
                'discountTaka' => intdiv($quote['discountPoisha'], 100),
                'extraDiscountTaka' => intdiv($quote['extraDiscountPoisha'], 100),
                // Null until a district is chosen — "not priced yet" and "free"
                // are different facts, and only one of them should print ৳ 0.
                'deliveryTaka' => $quote['deliveryPoisha'] === null
                    ? null
                    : intdiv($quote['deliveryPoisha'], 100),
                // The charge that is NOT being made — 0 unless free delivery
                // was given. Beside `deliveryTaka: 0` it is what tells "we
                // waived ৳ 130" apart from a zone that costs nothing.
                'deliveryWaivedTaka' => intdiv($quote['deliveryWaivedPoisha'], 100),
                'totalTaka'    => intdiv($quote['totalPoisha'], 100),
            ],

            // A sentence when the extra discount is more than the goods come
            // to, null otherwise. The totals beside it are worked out without
            // it, as they are for a dead coupon; placing refuses on it.
            'extraDiscountProblem' => $quote['extraDiscountProblem'],

            'promo' => $quote['promoCode'] === null ? null : [
                'code'    => $quote['promoCode'],
                // A sentence when the code takes nothing off, null when it
                // works. Placing the order refuses on the same sentence.
                'problem' => $quote['promoProblem'],
            ],

            'delivery' => [
                'chosen'  => $quote['zone']?->toQuote(),
                // Every service this district is actually offered, so the form
                // draws its choices from the list the order will be checked
                // against rather than from one of its own.
                'options' => array_map(fn (DeliveryZone $z): array => $z->toQuote(), $quote['zones']),
            ],

            'shipsOn' => $quote['shipsOn'],
            'splits'  => $quote['splits'],
        ]]);
    }

    /**
     * POST /api/admin/orders
     *
     * Place it. From here on it is an order like any other: it appears on the
     * list, prints a slip, books a courier and texts the customer by the same
     * code a website order does, because it is a row in the same table written
     * by the same method.
     *
     * TWO THINGS ARE RECORDED THAT A WEBSITE ORDER HAS NO NEED OF
     *
     *   - `channel`, on the order: which door it came through.
     *   - a note, in the timeline: that a person typed it in, and who. An
     *     order nobody placed online must not look as though somebody did.
     *
     * OTHERWISE IT IS THE SAME ORDER. It lands in `placed`, as a website
     * order does, and is confirmed, packed and shipped by the same buttons.
     *
     * ONE STEP CAN BE TAKEN EARLY, AND ONLY WHEN THE FORM ASKS. `placed` means
     * "it arrived and nobody has spoken to them yet"; an order taken on a call
     * may already have been confirmed on that call. With `confirmed` set it is
     * moved on to `confirmed` — through OrderFulfilmentService, the way a
     * click on "Confirm — call done" would be, which is what writes the
     * history row and sends the customer their order number by SMS. It is the
     * same click, made one screen sooner; nothing about the order differs.
     *
     * AND TWO THINGS CAN BE GIVEN, BY AN ACCOUNT TRUSTED TO GIVE THEM: an
     * extra discount and free delivery. Each takes something off a figure the
     * server worked out, is written on the order beside the result, and is
     * said in the timeline under the name of whoever gave it — see
     * givenAway(). An order with neither is the order it always was.
     */
    public function store(OrderStoreRequest $request): JsonResponse
    {
        if ($refused = $this->mayNotGive($request)) {
            return $refused;
        }

        // One window only: this code deployed, the migration not yet run.
        // Without the check that is a 500 on Place order with nothing to say
        // what is missing. Website orders are unaffected either way — the
        // checkout never names these columns. The second half is the same
        // window for the 2026_10_12 migration, and only an order that
        // actually gives something needs it.
        if (! Schema::hasColumn('orders', 'channel')
            || ($this->gives($request) && ! Schema::hasColumn('orders', 'extra_discount_poisha'))) {
            return response()->json([
                'message' => 'Orders taken by hand need one database change first. '
                    . 'Run “php artisan migrate” on the server, then place this again.',
            ], 422);
        }

        $admin = $request->user('admin');
        $data  = $request->validated();
        $taken = self::TAKEN[$data['channel']];

        try {
            $orders = DB::transaction(function () use ($data, $admin, $taken): array {
                $first = $this->orders->placeManual($data['lines'], [
                    'name'     => $data['name'],
                    'phone'    => $data['phone'],
                    'email'    => $data['email'] ?? null,
                    'address'  => $data['address'] ?? null,
                    'area'     => $data['area'] ?? null,
                    'district' => $data['district'],
                    'notes'    => $data['notes'] ?? null,
                    'delivery' => $data['delivery'] ?? null,
                    'payment'  => $data['payment'],
                    'promo'    => $data['promo'] ?? null,
                    'channel'  => $data['channel'],
                    'extraDiscount' => $data['extraDiscount'] ?? null,
                    'freeDelivery'  => $data['freeDelivery'] ?? false,
                ]);

                // One order, or two when the basket held something that has
                // not landed yet — see THE SPLIT in OrderService. Both were
                // taken on the same call and both get the same record of it.
                $orders = $first->placement_ref === null
                    ? [$first]
                    : Order::query()->where('placement_ref', $first->placement_ref)->orderBy('id')->get()->all();

                // Inside the transaction, like the note destroy() writes: there
                // is no version of this in which an order exists that a person
                // typed in and nothing says so.
                if (Schema::hasTable('order_notes')) {
                    foreach ($orders as $order) {
                        OrderNote::create([
                            'order_id'        => $order->id,
                            'body'            => "Custom order — taken {$taken} and added by staff. "
                                . 'The customer did not place it on the website.'
                                . $this->givenAway($order),
                            'author_admin_id' => $admin->id,
                            'author_name'     => $admin->name,
                        ]);
                    }
                }

                return $orders;
            });
        } catch (RuntimeException $e) {
            // 422, not 500: stock ran out between the quote and the click, or
            // a code expired. The form keeps everything typed and says why.
            return response()->json(['message' => $e->getMessage()], 422);
        }

        // After the commit, never inside it — transition() fires the event
        // that texts the customer, and an SMS for an order a rollback then
        // took back is a promise about a parcel that does not exist.
        $warning = null;

        if ($request->boolean('confirmed')) {
            foreach ($orders as $i => $order) {
                try {
                    $orders[$i] = $this->fulfilment->transition(
                        order:     $order,
                        to:        'confirmed',
                        mayEnd:    $admin->may('orders.cancel'),
                        actorId:   $admin->id,
                        actorName: $admin->name,
                        note:      "Confirmed with the customer when the order was taken {$taken}.",
                    );
                } catch (RuntimeException $e) {
                    // The order IS placed. Failing the whole request here
                    // would invite the click that places it a second time, so
                    // it is reported instead and left in Placed to be
                    // confirmed by hand.
                    $warning = "{$order->order_number} was placed but could not be marked confirmed: "
                        . $e->getMessage();
                }
            }
        }

        return response()->json(['data' => [
            // The one that ships first — what the form shows and prints.
            'orderNumber' => $orders[0]->order_number,
            'orders'      => array_map(fn (Order $o): array => [
                'orderNumber' => $o->order_number,
                'status'      => $o->status,
                'totalTaka'   => intdiv($o->total_poisha, 100),
                'shipsOn'     => $o->preorder_ships_on?->toDateString(),
            ], $orders),
            'warning'     => $warning,
        ]], 201);
    }

    /** Does this request ask for an extra discount or for free delivery? */
    private function gives(Request $request): bool
    {
        return (int) $request->input('extraDiscount') > 0 || $request->boolean('freeDelivery');
    }

    /**
     * The refusal for an account that may take an order but not discount one —
     * or null, which is the answer for every request that gives nothing.
     *
     * WHY IT IS NOT `orders.edit`. That is the shop floor's permission, held
     * so that the person with the phone can write the order down. Deciding
     * what the shop will take LESS for is a different trust, and it has its
     * own box on the staff screen: `orders.discount`.
     *
     * Checked here rather than on the route because the route is the same one
     * either way — it is two fields of the request that need the permission,
     * not the request. And on the quote as well as on placing, so an account
     * without it is never shown a total it then cannot place.
     *
     * 403, like the middleware's own refusal, and in its words.
     */
    private function mayNotGive(Request $request): ?JsonResponse
    {
        if (! $this->gives($request) || $request->user('admin')->may('orders.discount')) {
            return null;
        }

        return response()->json([
            'message' => 'Your account can take an order but cannot give an extra discount or free delivery. '
                . 'Ask an owner to turn that on, or place the order without them.',
        ], 403);
    }

    /**
     * What was given away on this order, as lines for its timeline — or
     * nothing, which is what nearly every order gets.
     *
     * Read off the order rather than off the request, so it says what was
     * WRITTEN: when a basket splits in two, each order carries its own share
     * of the discount and only the first carries the delivery.
     *
     * It goes in the note that already records who typed the order in, which
     * is what answers "who gave this away" without a column for it.
     */
    private function givenAway(Order $order): string
    {
        $extra  = (int) $order->extra_discount_poisha;
        $waived = (int) $order->delivery_waived_poisha;

        return ($extra > 0 ? "\nExtra discount given: ৳ " . number_format(intdiv($extra, 100)) . '.' : '')
            . ($waived > 0
                ? "\nFree delivery given — the ৳ " . number_format(intdiv($waived, 100)) . ' charge was not added.'
                : '');
    }
}
