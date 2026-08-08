<?php

declare(strict_types=1);

namespace Modules\Payments\Gateways;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Modules\Payments\Contracts\PaymentGateway;
use Modules\Payments\Models\Payment;
use Modules\Payments\Services\PaymentOutcome;
use RuntimeException;

/**
 * bKash Tokenized Checkout.
 *
 * The flow, as bKash designed it:
 *
 *   1. grant token   — server → bKash, credentials for a short-lived id_token
 *   2. create        — server → bKash, "this order, this amount"; bKash answers
 *                      with a paymentID and a bkashURL
 *   3. redirect      — the customer pays inside bKash's own page
 *   4. callback      — bKash sends the browser back with paymentID + status
 *   5. execute       — server → bKash. THIS is the step that moves money.
 *                      A "success" in the callback query string is a claim;
 *                      execute's answer is the fact.
 *
 * The id_token is cached for 50 minutes (bKash grants 60). Grant is one HTTP
 * call, but it is also the call bKash rate-limits hardest — one grant per
 * checkout would hit that wall on the first busy evening.
 *
 * Sandbox first: BKASH_BASE_URL defaults to the sandbox host, so the day the
 * credentials arrive nothing real can be charged by accident. Production is a
 * deliberate one-line change in .env (ACTION-REQUIRED §bKash).
 */
final class BkashGateway implements PaymentGateway
{
    public function key(): string
    {
        return 'bkash';
    }

    public function configured(): bool
    {
        return (string) config('services.bkash.app_key') !== ''
            && (string) config('services.bkash.app_secret') !== ''
            && (string) config('services.bkash.username') !== ''
            && (string) config('services.bkash.password') !== '';
    }

    public function initiate(Payment $payment): string
    {
        $order = $payment->order;

        $response = $this->call('/tokenized/checkout/create', [
            'mode'                  => '0011',              // checkout (URL) mode
            'payerReference'        => $order->customer_phone,
            'callbackURL'           => url('/api/payments/callback/bkash'),
            'amount'                => $this->taka($payment->amount_poisha),
            'currency'              => 'BDT',
            'intent'                => 'sale',
            'merchantInvoiceNumber' => $order->order_number,
        ]);

        if (($response['statusCode'] ?? '') !== '0000' || empty($response['bkashURL'])) {
            throw new RuntimeException(
                'bKash did not accept the payment: ' . ($response['statusMessage'] ?? 'no answer')
            );
        }

        // The paymentID is how the callback finds its way back to this row.
        $payment->update([
            'gateway_ref' => $response['paymentID'],
            'response'    => $response,
        ]);

        return $response['bkashURL'];
    }

    public function finalise(array $query): PaymentOutcome
    {
        $paymentId = (string) ($query['paymentID'] ?? '');
        $payment = Payment::query()
            ->where('gateway', 'bkash')->where('gateway_ref', $paymentId)
            ->latest('id')->first();

        if ($payment === null) {
            return new PaymentOutcome(null, false, null, 'Unknown bKash payment reference.');
        }

        // The customer backed out or bKash refused — no money moved, and
        // execute must not be called for a payment bKash says did not happen.
        if (($query['status'] ?? '') !== 'success') {
            $payment->update(['status' => 'cancelled', 'response' => $query]);

            return new PaymentOutcome($payment, false, null, 'Payment was cancelled.');
        }

        $response = $this->call('/tokenized/checkout/execute', ['paymentID' => $paymentId]);

        // Execute can time out AFTER the money moved — bKash's own docs say
        // so. Status query is the tiebreak; skipping it would double-charge
        // the support desk, not the customer.
        if (($response['statusCode'] ?? '') !== '0000') {
            $response = $this->call('/tokenized/checkout/payment/status', ['paymentID' => $paymentId]);
        }

        $paid = ($response['statusCode'] ?? '') === '0000'
            && ($response['transactionStatus'] ?? '') === 'Completed';

        $payment->update([
            'status'   => $paid ? 'completed' : 'failed',
            'trx_id'   => $response['trxID'] ?? null,
            'response' => $response,
        ]);

        return new PaymentOutcome(
            $payment,
            $paid,
            $response['trxID'] ?? null,
            $paid ? 'Payment completed.' : ($response['statusMessage'] ?? 'Payment failed.'),
        );
    }

    /** One authenticated POST to the tokenized-checkout API. */
    private function call(string $path, array $body): array
    {
        $response = Http::timeout(30)
            ->withHeaders([
                'Authorization' => $this->idToken(),
                'X-APP-Key'     => config('services.bkash.app_key'),
            ])
            ->post(rtrim((string) config('services.bkash.base_url'), '/') . $path, $body);

        return (array) $response->json();
    }

    /**
     * The short-lived id_token, cached below its 60-minute life. A stale
     * token answers 401-shaped errors; the cache simply expiring first is the
     * whole retry strategy.
     */
    private function idToken(): string
    {
        return Cache::remember('payments.bkash.id_token', now()->addMinutes(50), function (): string {
            $response = Http::timeout(30)
                ->withHeaders([
                    'username' => config('services.bkash.username'),
                    'password' => config('services.bkash.password'),
                ])
                ->post(rtrim((string) config('services.bkash.base_url'), '/') . '/tokenized/checkout/token/grant', [
                    'app_key'    => config('services.bkash.app_key'),
                    'app_secret' => config('services.bkash.app_secret'),
                ]);

            $token = $response->json('id_token');

            if (! is_string($token) || $token === '') {
                throw new RuntimeException(
                    'bKash would not issue a token: ' . ($response->json('statusMessage') ?? $response->status())
                );
            }

            return $token;
        });
    }

    /** 138000 poisha → "1380.00" — bKash wants a decimal string, not cents. */
    private function taka(int $poisha): string
    {
        return number_format($poisha / 100, 2, '.', '');
    }
}
