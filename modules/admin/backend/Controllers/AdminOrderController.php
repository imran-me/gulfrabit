<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
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
            'status'        => ['sometimes', 'in:placed,confirmed,packed,shipped,delivered,cancelled,returned'],
            'paymentStatus' => ['sometimes', 'in:pending,paid,failed,refunded'],
            'q'             => ['sometimes', 'string', 'max:64'],
            'from'          => ['sometimes', 'date'],
            'to'            => ['sometimes', 'date', 'after_or_equal:from'],
            'perPage'       => ['sometimes', 'integer', 'min:10', 'max:100'],
        ]);

        $query = Order::query()->with('items:id,order_id,title,qty')->latest('placed_at');

        if (isset($data['status'])) {
            $query->where('status', $data['status']);
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

        $page = $query->paginate($data['perPage'] ?? 25);

        return response()->json([
            'data' => array_map(
                fn (Order $o): array => $this->rowArray($o),
                $page->items(),
            ),
            'meta' => [
                'total'       => $page->total(),
                'perPage'     => $page->perPage(),
                'currentPage' => $page->currentPage(),
                'lastPage'    => $page->lastPage(),
            ],
        ]);
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

                'history' => $order->statusEvents->map->toAdminArray()->all(),
                'refunds' => $order->refunds->map->toAdminArray()->all(),

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

    private function rowArray(Order $o): array
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
        ];
    }
}
