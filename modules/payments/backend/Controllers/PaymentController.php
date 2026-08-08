<?php

declare(strict_types=1);

namespace Modules\Payments\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;
use Modules\Checkout\Models\Order;
use Modules\Payments\Services\PaymentService;
use Throwable;

/**
 * The three doors of online payment: which gateways exist, start one, and
 * receive the customer coming back.
 *
 * A failed payment NEVER fails the order. The order was placed before any of
 * this ran, and this market's default — cash on delivery — is always standing
 * behind it. The worst outcome of everything in this file is "pay the courier
 * instead", which is where most orders end up anyway.
 */
final class PaymentController extends Controller
{
    public function __construct(private readonly PaymentService $payments)
    {
    }

    /**
     * GET /api/payments/methods — which gateways the checkout may offer.
     *
     * Public and cheap: it reads config, not the database. The checkout page
     * calls it to decide which payment options to draw; on a static host the
     * call 404s and the page keeps its no-backend behaviour.
     */
    public function methods(): JsonResponse
    {
        return response()->json(['data' => $this->payments->methods()]);
    }

    /**
     * POST /api/payments/intent — begin paying an order.
     *
     * Guest security is the tracking page's rule: the order number alone is
     * not a credential, so the phone that placed the order must come too. A
     * mismatch is 404, not 403 — confirming an order number exists is itself
     * information worth withholding.
     */
    public function intent(Request $request): JsonResponse
    {
        $data = $request->validate([
            'order' => ['required', 'string', 'max:20'],
            'phone' => ['required', 'string', 'max:20'],
        ]);

        $order = Order::query()->where('order_number', $data['order'])->first();

        if ($order === null || $this->digits($order->customer_phone) !== $this->digits($data['phone'])) {
            return response()->json(['message' => 'Order not found.'], 404);
        }

        if ($order->payment_status === 'paid') {
            return response()->json(['message' => 'This order is already paid.'], 422);
        }

        $gateway = $this->payments->gateway($order->payment_method);

        if ($gateway === null) {
            // Placed as bkash/nagad while the gateway is unconfigured, or as
            // COD. Not an error state — the order simply pays on delivery.
            return response()->json(['message' => 'Online payment is not available for this order.'], 501);
        }

        $payment = $this->payments->open($order, $gateway->key());

        try {
            return response()->json(['data' => ['redirect' => $gateway->initiate($payment)]]);
        } catch (Throwable $e) {
            $payment->update(['status' => 'failed', 'response' => ['error' => $e->getMessage()]]);
            Log::warning('[payments] initiate failed', ['gateway' => $gateway->key(), 'error' => $e->getMessage()]);

            return response()->json([
                'message' => 'The payment service is not answering. Your order stands — you can pay on delivery.',
            ], 502);
        }
    }

    /**
     * GET /api/payments/callback/{gateway} — the customer returns.
     *
     * The browser lands here, not on a page: the gateway must be asked
     * server-to-server what actually happened before the customer is shown
     * anything. Then a redirect to the confirmation page they were always
     * heading to, carrying the verdict in the query string.
     */
    public function callback(string $gateway, Request $request): RedirectResponse
    {
        $driver = $this->payments->gateway($gateway);

        $verdict = 'failed';
        $orderNumber = '';

        if ($driver !== null) {
            try {
                $outcome = $driver->finalise($request->query());
                $this->payments->recordOutcome($outcome);

                $orderNumber = $outcome->payment?->order?->order_number ?? '';
                $verdict = $outcome->paid
                    ? 'success'
                    : ($outcome->payment?->status === 'cancelled' ? 'cancelled' : 'failed');
            } catch (Throwable $e) {
                // The verdict stays "failed" and support has the log line. The
                // customer's order is intact either way.
                Log::warning('[payments] callback failed', ['gateway' => $gateway, 'error' => $e->getMessage()]);
            }
        }

        return redirect()->away(url(
            '/modules/checkout/order-confirmation.html'
            . '?id=' . rawurlencode($orderNumber)
            . '&payment=' . $verdict
        ));
    }

    /** Comparison form of a phone: digits only, country code stripped. */
    private function digits(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        return str_starts_with($digits, '88') ? substr($digits, 2) : $digits;
    }
}
