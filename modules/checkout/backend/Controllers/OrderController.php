<?php

declare(strict_types=1);

namespace Modules\Checkout\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Cart\Services\CartService;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Requests\PlaceOrderRequest;
use Modules\Checkout\Services\OrderService;
use RuntimeException;

/**
 * Order placement and lookup.
 */
class OrderController extends Controller
{
    private const GUEST_COOKIE = 'gr_cart';

    public function __construct(
        private readonly OrderService $orders,
        private readonly CartService $carts,
    ) {
    }

    /**
     * POST /api/orders — place an order from the caller's cart.
     */
    public function store(PlaceOrderRequest $request): JsonResponse
    {
        $cart = $this->carts->resolve(
            $request->cookie(self::GUEST_COOKIE),
            $request->user()?->id,
        );

        try {
            $order = $this->orders->placeFromCart(
                $cart,
                $request->validated(),
                $request->user()?->id,
            );
        } catch (RuntimeException $e) {
            // Empty cart, out of stock, unserviceable district — all states the
            // customer can act on, so 422 rather than a 500.
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $order->toStorefrontArray()], 201);
    }

    /**
     * GET /api/orders/{order_number}
     *
     * Guests track by order number PLUS the phone that placed it. The number
     * alone is not a credential — anyone who saw a screenshot would otherwise
     * be able to read the customer's address.
     */
    public function show(Request $request, Order $order): JsonResponse
    {
        $user = $request->user();

        if ($user !== null && $order->user_id === $user->id) {
            return response()->json(['data' => $order->load('items')->toStorefrontArray()]);
        }

        $phone = preg_replace('/\D/', '', (string) $request->query('phone'));
        $phone = str_starts_with((string) $phone, '88') ? substr((string) $phone, 2) : $phone;

        if ($phone !== '' && $phone === $order->customer_phone) {
            return response()->json(['data' => $order->load('items')->toStorefrontArray()]);
        }

        // Deliberately 404, not 403: confirming an order number exists is
        // itself information worth withholding.
        return response()->json(['message' => 'Order not found.'], 404);
    }

    /**
     * GET /api/orders — the signed-in customer's history.
     */
    public function index(Request $request): JsonResponse
    {
        $orders = Order::query()
            ->where('user_id', $request->user()->id)
            ->with('items')
            ->latest('placed_at')
            ->paginate(20);

        return response()->json([
            'data' => collect($orders->items())->map(fn (Order $o) => $o->toStorefrontArray())->all(),
            'meta' => [
                'total' => $orders->total(),
                'currentPage' => $orders->currentPage(),
                'lastPage' => $orders->lastPage(),
            ],
        ]);
    }
}
