<?php

declare(strict_types=1);

namespace Modules\Sms\Listeners;

use Modules\Checkout\Events\OrderStatusChanged;
use Modules\Sms\Services\SmsService;

/**
 * The two SMS a COD customer actually needs.
 *
 * confirmed — "a human looked at this and it is really coming". The order was
 *   confirmed on a phone call, so the SMS is the written receipt of that call:
 *   the number to quote and the amount to keep ready.
 * shipped — "keep the cash by the door". The parcel is with a courier and the
 *   next knock costs money; this is the moment the amount matters most.
 *
 * Nothing on `placed` — the confirmation call IS the placed-notification, and
 * an SMS for an order that then fails its call would promise a delivery that
 * is not coming. Nothing on cancelled/returned either: those conversations
 * happen on the phone, where they belong.
 *
 * English on purpose. Bangla SMS is UCS-2: 70 characters a segment against
 * 160, so every Bangla message costs roughly triple. These are transactional
 * one-liners a Dhaka customer reads fine in English; the savings pay for the
 * next campaign.
 */
final class SendOrderStatusSms
{
    public function __construct(private readonly SmsService $sms)
    {
    }

    public function handle(OrderStatusChanged $event): void
    {
        $order = $event->order;

        $body = match ($event->to) {
            'confirmed' => sprintf(
                'GulfRabit: Your order %s is confirmed. %s We will SMS you again when it ships.',
                $order->order_number,
                $this->amountLine($order->payment_status, $order->total_poisha),
            ),
            'shipped' => sprintf(
                'GulfRabit: Your order %s is on the way. %s Track: %s',
                $order->order_number,
                $this->amountLine($order->payment_status, $order->total_poisha),
                url('/modules/account/track.html'),
            ),
            default => null,
        };

        if ($body !== null) {
            $this->sms->send($order->customer_phone, $body, $order->id);
        }
    }

    /**
     * The money sentence, told truthfully: a prepaid order must not be asked
     * to pay the courier again, and a COD order must know what to keep ready.
     */
    private function amountLine(string $paymentStatus, int $totalPoisha): string
    {
        $taka = number_format(intdiv($totalPoisha, 100));

        return $paymentStatus === 'paid'
            ? "Tk {$taka}, already paid."
            : "Please keep Tk {$taka} ready for the courier.";
    }
}
