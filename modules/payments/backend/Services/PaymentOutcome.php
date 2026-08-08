<?php

declare(strict_types=1);

namespace Modules\Payments\Services;

use Modules\Payments\Models\Payment;

/**
 * A gateway's final word on one payment attempt.
 *
 * `paid` is the only field money decisions read. `trxId` is the gateway's own
 * transaction id — the string a customer quotes from their bKash/Nagad app,
 * and the one that reconciles our books against the gateway statement.
 */
final class PaymentOutcome
{
    public function __construct(
        public readonly ?Payment $payment,
        public readonly bool $paid,
        public readonly ?string $trxId,
        public readonly string $message,
    ) {
    }
}
