<?php

declare(strict_types=1);

namespace Modules\Checkout\Events;

use Modules\Checkout\Models\Order;

/**
 * An order moved through the fulfilment map — placed→confirmed, packed→shipped.
 *
 * WHY AN EVENT AND NOT A CALL
 * ---------------------------
 * The things that want to react to a status change — an SMS to the customer,
 * one day a courier booking or an accounting entry — are features checkout must
 * not know about. Module dependencies here run one way: sms depends on
 * checkout, never the reverse. Deleting modules/sms removes the listener and
 * this event simply has no audience, which is the correct failure mode.
 *
 * Dispatched AFTER the transition's transaction commits, never inside it: a
 * listener that talks to an SMS gateway must not hold a row lock open for the
 * length of an HTTP call, and must never see (or announce) a status that a
 * rollback then takes back.
 */
final class OrderStatusChanged
{
    public function __construct(
        public readonly Order $order,
        public readonly string $from,
        public readonly string $to,
    ) {
    }
}
