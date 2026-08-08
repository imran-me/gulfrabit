<?php

declare(strict_types=1);

namespace Modules\Payments\Services;

use Illuminate\Support\Facades\DB;
use Modules\Checkout\Models\Order;
use Modules\Payments\Contracts\PaymentGateway;
use Modules\Payments\Gateways\BkashGateway;
use Modules\Payments\Gateways\NagadGateway;
use Modules\Payments\Models\Payment;

/**
 * The one place an order becomes paid.
 *
 * endpoints.md (checkout) has said since the day it was written: "Only a
 * gateway callback may set `paid`." This class is that sentence as code. The
 * admin panel cannot mark an order paid, the client certainly cannot, and a
 * gateway can only do it by coming through recordOutcome() with a verified
 * PaymentOutcome in hand.
 */
final class PaymentService
{
    /** @var array<int, class-string<PaymentGateway>> */
    private const GATEWAYS = [
        BkashGateway::class,
        NagadGateway::class,
    ];

    /**
     * Which gateways are offered right now. Configuration-driven, same
     * contract as everything else: no credentials, not offered, no error.
     *
     * @return array<string, bool>
     */
    public function methods(): array
    {
        $methods = [];
        foreach (self::GATEWAYS as $class) {
            $gateway = app($class);
            $methods[$gateway->key()] = $gateway->configured();
        }

        return $methods;
    }

    /** The gateway for a key, or null if unknown / not configured. */
    public function gateway(string $key): ?PaymentGateway
    {
        foreach (self::GATEWAYS as $class) {
            $gateway = app($class);
            if ($gateway->key() === $key && $gateway->configured()) {
                return $gateway;
            }
        }

        return null;
    }

    /**
     * Open a payment attempt for an order. The amount is snapshotted here —
     * the gateway will be told this number and no other.
     */
    public function open(Order $order, string $gatewayKey): Payment
    {
        return Payment::create([
            'order_id'      => $order->id,
            'gateway'       => $gatewayKey,
            'amount_poisha' => $order->total_poisha,
            'status'        => 'initiated',
        ]);
    }

    /**
     * Write a gateway's verdict onto the order. Idempotent: bKash and Nagad
     * both reserve the right to send a browser back twice, and the second
     * arrival must find nothing left to do rather than double-record.
     */
    public function recordOutcome(PaymentOutcome $outcome): void
    {
        if ($outcome->payment === null || ! $outcome->paid) {
            return;                       // attempt rows were already updated by the gateway
        }

        DB::transaction(function () use ($outcome): void {
            $order = Order::query()
                ->whereKey($outcome->payment->order_id)
                ->lockForUpdate()
                ->first();

            if ($order === null || $order->payment_status === 'paid') {
                return;
            }

            $order->update([
                'payment_status'    => 'paid',
                'payment_reference' => $outcome->trxId,
            ]);
        });
    }
}
