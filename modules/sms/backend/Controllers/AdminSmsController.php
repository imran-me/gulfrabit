<?php

declare(strict_types=1);

namespace Modules\Sms\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Checkout\Models\Order;
use Modules\Sms\Models\SmsLog;
use Modules\Sms\Requests\SendCustomerSmsRequest;
use Modules\Sms\Services\SmsService;

/**
 * Messaging a customer about their order, from the order screen.
 *
 * WHY THE PANEL DOES NOT ACCEPT A PHONE NUMBER
 * --------------------------------------------
 * The only input is the message body. The destination is read from the order
 * the route is bound to, so this endpoint cannot be used to send an SMS to an
 * arbitrary number — not by a compromised staff session, not by a bug in the
 * page script, not by somebody curious with the network tab open. An admin
 * panel with a "phone" field and a "message" field is an SMS gateway with a
 * login form in front of it, and the credit is prepaid and ours.
 *
 * WHY IT LIVES IN modules/sms
 * ---------------------------
 * Same rule as everywhere: the feature and its screen leave together. Admin
 * knows nothing about messaging — the panel on the order page is mounted by
 * this module's own script (sms-order-panel.js), exactly as the courier module
 * mounts its own block. Delete modules/sms and the order screen loses a card
 * and nothing else.
 */
class AdminSmsController extends Controller
{
    public function __construct(private readonly SmsService $sms)
    {
    }

    /**
     * GET /api/admin/orders/{order}/messages
     *
     * Everything ever sent to this customer about this order, automatic alerts
     * included. Staff need to see that the "your order shipped" SMS already
     * went before they type it again by hand.
     */
    public function index(Order $order): JsonResponse
    {
        $messages = SmsLog::query()
            ->where('order_id', $order->id)
            ->oldest()
            ->get()
            ->map
            ->toAdminArray()
            ->all();

        return response()->json([
            'data' => $messages,
            'meta' => [
                // The panel refuses to draw a compose box that cannot send, and
                // says why instead. A send button that silently does nothing
                // because no API key is configured is the worst of both.
                'canSend'  => $this->sms->configured(),
                'gateway'  => (string) config('services.sms.gateway'),
                'sendsTo'  => $order->customer_phone,
            ],
        ]);
    }

    /**
     * POST /api/admin/orders/{order}/messages
     *
     * Sends now, synchronously — see the note on SmsService about why there is
     * no queue at this shop's volume. Returns 502 when the gateway refuses, so
     * the panel can say "not sent" rather than showing the message in the
     * thread as though it had gone.
     */
    public function store(SendCustomerSmsRequest $request, Order $order): JsonResponse
    {
        if (! $this->sms->configured()) {
            return response()->json([
                'message' => 'No SMS gateway is configured yet, so nothing can be sent. '
                    . 'Add the credentials in .env first.',
            ], 422);
        }

        $admin = $request->user('admin');

        $sent = $this->sms->send(
            phone:      $order->customer_phone,
            body:       $request->string('body')->trim()->toString(),
            orderId:    $order->id,
            sentByName: $admin->name,
            kind:       'manual',
        );

        // Either way there is now a row in sms_logs, and the thread shows it
        // with its real status. A failed send that vanished from the screen is
        // how staff end up believing they told somebody something.
        $latest = SmsLog::query()
            ->where('order_id', $order->id)
            ->latest('id')
            ->first();

        return response()->json(
            ['data' => $latest?->toAdminArray()],
            $sent ? 201 : 502,
        );
    }
}
