<?php

declare(strict_types=1);

namespace Modules\Payments\Contracts;

use Modules\Payments\Models\Payment;
use Modules\Payments\Services\PaymentOutcome;

/**
 * What a payment gateway must be able to do. Two methods carry the money:
 * send the customer out, and make sense of what comes back.
 *
 * The shape mirrors modules/courier's CourierDriver on purpose — a gateway
 * with no credentials reports !configured() and the rest of the system treats
 * it as absent, rather than half-working.
 */
interface PaymentGateway
{
    /** 'bkash' | 'nagad' — the key used in URLs, config and the orders table. */
    public function key(): string;

    /** Are the credentials present? Absent credentials mean the gateway is not offered at all. */
    public function configured(): bool;

    /**
     * Register the payment on the gateway's side and return the URL to send
     * the customer's browser to. The Payment row is already saved; implementors
     * must store their reference id on it before returning.
     *
     * @throws \RuntimeException with a human-readable reason when the gateway
     *   refuses or cannot be reached. The caller answers 502; the order is
     *   untouched and still payable on delivery.
     */
    public function initiate(Payment $payment): string;

    /**
     * The customer is back from the gateway. Verify server-to-server what
     * actually happened — the query string states an OUTCOME, but only the
     * gateway's API states the truth — and return the verdict.
     *
     * Must never trust redirect parameters for the paid/not-paid decision.
     */
    public function finalise(array $query): PaymentOutcome;
}
