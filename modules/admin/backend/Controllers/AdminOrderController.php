<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Modules\Admin\Models\OrderNote;
use Modules\Admin\Requests\OrderNoteRequest;
use Modules\Admin\Requests\OrderRefundRequest;
use Modules\Admin\Requests\OrderTransitionRequest;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Services\OrderFulfilmentService;
use RuntimeException;

/**
 * Admin screens over the order book.
 *
 * Thin: every rule about what may change lives in OrderFulfilmentService, in
 * the checkout module, because those rules must hold for a courier webhook and
 * a customer cancellation too. This class shapes HTTP and enforces who is
 * asking.
 */
class AdminOrderController extends Controller
{
    public function __construct(
        private readonly OrderFulfilmentService $fulfilment,
    ) {
    }

    /**
     * GET /api/admin/orders
     *
     * Filters are all optional and all validated by whitelist. `status` reaches
     * a WHERE and `sort` reaches an ORDER BY, so neither is passed through.
     */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            // Whitelisted from the transition map itself, so a stage added to
            // the pipeline is filterable the same day it exists and a stage
            // removed stops being accepted — rather than this list quietly
            // drifting out of step with the one the server enforces.
            'status'        => ['sometimes', Rule::in(array_keys(OrderFulfilmentService::TRANSITIONS))],
            'paymentStatus' => ['sometimes', 'in:pending,paid,failed,refunded'],
            'q'             => ['sometimes', 'string', 'max:64'],
            'from'          => ['sometimes', 'date'],
            'to'            => ['sometimes', 'date', 'after_or_equal:from'],
            'perPage'       => ['sometimes', 'integer', 'min:10', 'max:100'],
            // The Deleted tab. A separate axis from `status`, not a tenth
            // stage: a deleted order KEEPS the stage it was in, so that
            // restoring it puts it back where it was rather than at the start
            // of the pipeline.
            'deleted'       => ['sometimes', 'boolean'],
        ]);

        $query = $this->filtered($data)
            ->with('items:id,order_id,title,qty')
            ->latest('placed_at');

        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }

        $page = $query->paginate($data['perPage'] ?? 25);
        $role = $request->user('admin')->role;

        return response()->json([
            'data' => array_map(
                fn (Order $o): array => $this->rowArray($o, $role),
                $page->items(),
            ),
            'meta' => [
                'total'       => $page->total(),
                'perPage'     => $page->perPage(),
                'currentPage' => $page->currentPage(),
                'lastPage'    => $page->lastPage(),
                'counts'      => $this->stageCounts($data),
            ],
        ]);
    }

    /**
     * Every filter EXCEPT status, as a fresh query.
     *
     * Status is left out here and applied by the caller because the stage tab
     * bar needs both readings of the same search: the rows for the stage you
     * are looking at, and how many are sitting in each of the others.
     *
     * @param  array<string, mixed>  $data
     */
    private function filtered(array $data): Builder
    {
        $query = Order::query();

        // Eloquent's global scope already hides deleted orders from every
        // other caller; this is the one screen allowed to look in the drawer,
        // and only when it asks.
        if (! empty($data['deleted'])) {
            $query->onlyTrashed();
        }

        if (isset($data['paymentStatus'])) {
            $query->where('payment_status', $data['paymentStatus']);
        }
        if (isset($data['from'])) {
            $query->whereDate('placed_at', '>=', $data['from']);
        }
        if (isset($data['to'])) {
            $query->whereDate('placed_at', '<=', $data['to']);
        }

        if (! empty($data['q'])) {
            $term = trim($data['q']);
            // Order number, phone and name only. Deliberately NOT a wildcard
            // across every column: staff search for a specific order, and a
            // broad LIKE over addresses turns the box into a way to trawl
            // customer records.
            $query->where(function ($w) use ($term): void {
                $w->where('order_number', 'like', "%{$term}%")
                    ->orWhere('customer_phone', 'like', "%{$term}%")
                    ->orWhere('customer_name', 'like', "%{$term}%");
            });
        }

        return $query;
    }

    /**
     * How many orders sit in each stage, under the current search.
     *
     * One GROUP BY, not one query per tab — nine round trips to paint a nav bar
     * is how a list screen becomes slow on the day the shop gets busy.
     *
     * Every known stage is present in the answer, including the empty ones: a
     * tab that vanishes when it hits zero moves the other tabs under the
     * cursor, and "no orders are waiting for a courier" is information worth
     * showing rather than hiding.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, int>
     */
    private function stageCounts(array $data): array
    {
        // Always the LIVE side, whichever tab is open. Every badge on this bar
        // has to predict what clicking it would show, and clicking a stage
        // leaves the drawer (see the tab handler in orders-page.js) — so stage
        // counts taken from the trashed set would be counts of a list nobody
        // can navigate to.
        $found = $this->filtered(['deleted' => false] + $data)
            ->getQuery()
            ->select('status', DB::raw('count(*) as aggregate'))
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        $counts = ['all' => (int) $found->sum()];

        foreach (OrderFulfilmentService::STAGE_ORDER as $stage) {
            $counts[$stage] = (int) ($found[$stage] ?? 0);
        }

        // And this one is always the trashed side, for the same reason: the
        // Deleted badge predicts the Deleted tab from wherever you are
        // standing, and reads the same from both sides of it.
        $counts['deleted'] = $this->filtered(['deleted' => true] + $data)->count();

        return $counts;
    }

    /** GET /api/admin/orders/{order} */
    public function show(Request $request, Order $order): JsonResponse
    {
        $order->load(['items', 'statusEvents', 'refunds']);
        $role = $request->user('admin')->role;

        return response()->json([
            'data' => [
                'orderNumber'   => $order->order_number,
                'status'        => $order->status,
                'paymentStatus' => $order->payment_status,
                'paymentMethod' => $order->payment_method,
                'placedAt'      => $order->placed_at?->toIso8601String(),
                'deletedAt'     => $order->deleted_at?->toIso8601String(),
                'shipsOn'       => $order->preorder_ships_on?->toDateString(),
                'preorderDue'   => $order->isPreorder() ? $order->preorderDue() : null,
                // Its sibling from the same checkout, when the basket split.
                'placementRef'  => $order->placement_ref,

                'customer' => [
                    'name'  => $order->customer_name,
                    'phone' => $order->customer_phone,
                    'email' => $order->customer_email,
                ],
                'delivery' => [
                    'address'  => $order->address_line,
                    'area'     => $order->area,
                    'district' => $order->district_name,
                    'zone'     => $order->delivery_zone_key,
                    'eta'      => $order->delivery_eta,
                    'notes'    => $order->delivery_notes,
                    'chargeTaka' => intdiv($order->delivery_charge_poisha, 100),
                ],
                'items' => $order->items->map(fn ($i): array => [
                    'sku'       => $i->sku,
                    'title'     => $i->title,
                    'variant'   => $i->variant,
                    'qty'       => $i->qty,
                    'unitTaka'  => intdiv($i->unit_price_poisha, 100),
                    'lineTaka'  => intdiv($i->line_total_poisha, 100),
                ])->all(),

                'totals' => [
                    'subtotalTaka'  => intdiv($order->subtotal_poisha, 100),
                    'discountTaka'  => intdiv($order->discount_poisha, 100),
                    'deliveryTaka'  => intdiv($order->delivery_charge_poisha, 100),
                    'totalTaka'     => intdiv($order->total_poisha, 100),
                    'refundedTaka'  => intdiv($this->fulfilment->refundedPoisha($order), 100),
                    'refundableTaka' => intdiv($this->fulfilment->refundablePoisha($order), 100),
                ],
                'promoCode' => $order->promo_code,

                // Which ad recruited this customer, or null for organic. The
                // campaign name is the figure a merchant actually reads;
                // the full UTM set rides along for anything finer.
                'adSource' => $order->ad_source,

                'history' => $order->statusEvents->map->toAdminArray()->all(),
                'refunds' => $order->refunds->map->toAdminArray()->all(),

                // Internal, and never sent anywhere. The panel labels them as
                // such next to the message thread, which is the one place the
                // distinction has to be unmistakable.
                //
                // Guarded by hasTable for one window only: between deploying
                // this code and running the migration. Without the guard a
                // missing order_notes table turns the ENTIRE order screen into
                // a 500 — no items, no customer, no transition buttons — and
                // the shop cannot work an order because a notes feature is not
                // installed. The panel says what to run; see notesReady below.
                'notes' => $this->notesReady()
                    ? OrderNote::query()
                        ->where('order_id', $order->id)
                        ->oldest()
                        ->get()
                        ->map
                        ->toAdminArray()
                        ->all()
                    : [],
                'notesReady' => $this->notesReady(),

                // Computed server-side from the same map the server enforces,
                // so the panel can never draw a button the API would refuse.
                'allowedTransitions' => $this->fulfilment->allowedTransitions($order, $role),
                'canRefund'          => $this->canRefund($role),
            ],
        ]);
    }

    /** POST /api/admin/orders/{order}/transition */
    public function transition(OrderTransitionRequest $request, Order $order): JsonResponse
    {
        $admin = $request->user('admin');

        try {
            $order = $this->fulfilment->transition(
                order:     $order,
                to:        $request->string('to')->toString(),
                role:      $admin->role,
                actorId:   $admin->id,
                actorName: $admin->name,
                note:      $request->input('note'),
            );
        } catch (RuntimeException $e) {
            // 422, not 500: the request was well formed, the business rule said
            // no. A 500 here would page somebody at night for a mis-click.
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['status' => $order->status]]);
    }

    /**
     * POST /api/admin/orders/{order}/notes
     *
     * Append-only and attributed. There is no edit and no delete route, for the
     * same reason the status trail has none: a record that can be tidied up
     * after an argument settles nothing.
     */
    public function addNote(OrderNoteRequest $request, Order $order): JsonResponse
    {
        $admin = $request->user('admin');

        $note = OrderNote::create([
            'order_id'        => $order->id,
            'body'            => $request->string('body')->trim()->toString(),
            'author_admin_id' => $admin->id,
            'author_name'     => $admin->name,
        ]);

        return response()->json(['data' => $note->toAdminArray()], 201);
    }

    /**
     * DELETE /api/admin/orders/{order}
     *
     * Takes the order off the floor. Does not destroy it — see the migration
     * that added `deleted_at` for why destroying one is not on offer at any
     * price: stock movements and journal entries point at this row, and the
     * order number is printed on a slip in somebody's hand.
     *
     * WHAT THIS DELIBERATELY DOES NOT DO
     * ----------------------------------
     * It does not reverse the journal entry, and it does not put stock back.
     * Both are real decisions with their own screens, and doing either as a
     * side effect of a delete is how a set of books stops balancing and how a
     * shelf count stops matching the shelf. The panel says as much before
     * asking: a paid order's confirm dialog names the reversal it is not doing.
     *
     * The note is written BEFORE the delete and inside the same transaction, so
     * there is no window in which the order is gone with nothing recording who
     * removed it — and because it is an ordinary order note it is still there,
     * in the timeline, if the order is restored a week later.
     */
    public function destroy(Request $request, Order $order): JsonResponse
    {
        if ($order->trashed()) {
            return response()->json(['message' => 'That order is already deleted.'], 422);
        }

        $admin = $request->user('admin');

        DB::transaction(function () use ($order, $admin): void {
            if ($this->notesReady()) {
                OrderNote::create([
                    'order_id'        => $order->id,
                    'body'            => 'Order deleted and moved to the Deleted tab.',
                    'author_admin_id' => $admin->id,
                    'author_name'     => $admin->name,
                ]);
            }

            $order->delete();
        });

        return response()->json([
            'message' => "{$order->order_number} deleted. It is in the Deleted tab and can be put back.",
        ]);
    }

    /**
     * POST /api/admin/orders/{order}/restore
     *
     * Back to the stage it was in, not to the start of the pipeline. A
     * restored order that reappears as `placed` would have to be walked
     * through confirm, pack and dispatch a second time for a parcel that has
     * already gone — which is why `status` is untouched by both directions of
     * this pair.
     */
    public function restore(Request $request, string $order): JsonResponse
    {
        $model = Order::withTrashed()->where('order_number', $order)->firstOrFail();

        if (! $model->trashed()) {
            return response()->json(['message' => 'That order is not deleted.'], 422);
        }

        $admin = $request->user('admin');

        DB::transaction(function () use ($model, $admin): void {
            $model->restore();

            if ($this->notesReady()) {
                OrderNote::create([
                    'order_id'        => $model->id,
                    'body'            => 'Order restored from the Deleted tab.',
                    'author_admin_id' => $admin->id,
                    'author_name'     => $admin->name,
                ]);
            }
        });

        return response()->json([
            'message' => "{$model->order_number} is back in "
                . str_replace('_', ' ', $model->status) . '.',
        ]);
    }

    /** POST /api/admin/orders/{order}/refund */
    public function refund(OrderRefundRequest $request, Order $order): JsonResponse
    {
        $admin = $request->user('admin');

        if (! $this->canRefund($admin->role)) {
            return response()->json([
                'message' => 'Your role cannot authorise refunds.',
            ], 403);
        }

        try {
            $refund = $this->fulfilment->refund(
                order:        $order,
                amountPoisha: (int) round($request->float('amountTaka') * 100),
                method:       $request->string('method')->toString(),
                reason:       $request->string('reason')->toString(),
                adminId:      $admin->id,
                adminName:    $admin->name,
                reference:    $request->input('reference'),
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $refund->toAdminArray()], 201);
    }

    /**
     * Refunds are money leaving the business. The warehouse role exists to move
     * parcels and is deliberately excluded, which is the same line the roles
     * table draws everywhere else.
     */
    private function canRefund(string $role): bool
    {
        return in_array($role, ['owner', 'manager', 'accounts'], true);
    }

    /**
     * Has the order_notes migration been run on this database?
     *
     * Cached per request: show() asks twice and the answer cannot change
     * mid-request, and a schema query per call is a round trip for nothing.
     */
    private ?bool $notesReady = null;

    private function notesReady(): bool
    {
        return $this->notesReady ??= Schema::hasTable('order_notes');
    }

    private function rowArray(Order $o, string $role): array
    {
        return [
            'orderNumber'   => $o->order_number,
            'customerName'  => $o->customer_name,
            'customerPhone' => $o->customer_phone,
            'district'      => $o->district_name,
            'status'        => $o->status,
            'paymentStatus' => $o->payment_status,
            'paymentMethod' => $o->payment_method,
            'itemCount'     => $o->items->sum('qty'),
            'totalTaka'     => intdiv($o->total_poisha, 100),
            'placedAt'      => $o->placed_at?->toIso8601String(),
            // Null for a live order. The row draws itself struck through when
            // this is set, so a screenshot of the Deleted tab can never be
            // mistaken for the live list.
            'deletedAt'     => $o->deleted_at?->toIso8601String(),

            /* Waiting on a shipment rather than on us. An order sitting in
               `confirmed` for a fortnight is normally a failure; for a
               pre-order it is the plan, and without this the two are
               indistinguishable on the board — so the genuinely stuck orders
               get lost among the ones that are merely early. */
            'shipsOn'       => $o->preorder_ships_on?->toDateString(),
            'preorderDue'   => $o->isPreorder() ? $o->preorderDue() : null,

            // The same list the detail screen gets, from the same map the
            // server enforces — so the row can offer "Confirm" without the
            // browser ever deciding what is legal. Working twenty orders
            // through a stage should not mean opening twenty pages.
            //
            // Empty for a deleted order. It is not in the pipeline any more,
            // and offering "Start packing" on a row in the Deleted tab invites
            // somebody to work an order that is not there.
            'allowedTransitions' => $o->trashed() ? [] : $this->fulfilment->allowedTransitions($o, $role),
        ];
    }
}
