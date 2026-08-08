<?php

declare(strict_types=1);

namespace Modules\Payments\Gateways;

use Illuminate\Support\Facades\Http;
use Modules\Payments\Contracts\PaymentGateway;
use Modules\Payments\Models\Payment;
use Modules\Payments\Services\PaymentOutcome;
use RuntimeException;

/**
 * Nagad checkout.
 *
 * Nagad's API is bKash's flow wearing cryptography: every sensitive payload is
 * RSA-encrypted with NAGAD'S public key and signed with OUR private key, and
 * their answers come back encrypted against our key. Four legs:
 *
 *   1. initialize — server → Nagad, the order id and a random challenge,
 *                   encrypted + signed. Answer: a paymentReferenceId and
 *                   Nagad's own challenge.
 *   2. complete   — server → Nagad, the amount bound to THEIR challenge (so a
 *                   replayed initialize cannot buy anything), encrypted +
 *                   signed. Answer: the URL to send the customer to.
 *   3. redirect   — the customer approves inside Nagad's page.
 *   4. verify     — server → Nagad after the browser comes back. The redirect
 *                   query claims an outcome; only /verify/payment states it.
 *
 * The two keys live in .env as single-line base64 (the body of the PEM with
 * its BEGIN/END armour and newlines stripped — see modules/payments/README).
 * Missing keys mean !configured() and the gateway is simply not offered.
 *
 * Sandbox by default, same policy as bKash: nothing real is chargeable until
 * NAGAD_BASE_URL is deliberately pointed at production.
 */
final class NagadGateway implements PaymentGateway
{
    public function key(): string
    {
        return 'nagad';
    }

    public function configured(): bool
    {
        return (string) config('services.nagad.merchant_id') !== ''
            && (string) config('services.nagad.public_key') !== ''
            && (string) config('services.nagad.private_key') !== '';
    }

    public function initiate(Payment $payment): string
    {
        $order = $payment->order;
        $merchantId = (string) config('services.nagad.merchant_id');

        // Nagad wants an alphanumeric order id, unique per ATTEMPT — the same
        // order retried after a cancel must not collide with its own ghost.
        $orderId = preg_replace('/[^A-Za-z0-9]/', '', $order->order_number) . 'T' . $payment->id;
        $now = now('Asia/Dhaka')->format('YmdHis');

        $init = $this->post("/api/dfs/check-out/initialize/{$merchantId}/{$orderId}", [
            'accountNumber' => (string) config('services.nagad.merchant_number'),
            'dateTime'      => $now,
            'sensitiveData' => $this->encrypt([
                'merchantId' => $merchantId,
                'datetime'   => $now,
                'orderId'    => $orderId,
                'challenge'  => bin2hex(random_bytes(20)),
            ]),
            'signature'     => $this->sign([
                'merchantId' => $merchantId,
                'datetime'   => $now,
                'orderId'    => $orderId,
            ]),
        ]);

        $opened = $this->decrypt((string) ($init['sensitiveData'] ?? ''));
        $reference = (string) ($opened['paymentReferenceId'] ?? '');

        if ($reference === '') {
            throw new RuntimeException(
                'Nagad did not open the payment: ' . ($init['message'] ?? 'no answer')
            );
        }

        // The amount is bound to Nagad's OWN challenge from the initialize
        // answer — that binding is what makes a replayed initialize worthless.
        $sensitive = [
            'merchantId'   => $merchantId,
            'orderId'      => $orderId,
            'currencyCode' => '050',                       // ISO 4217 numeric, BDT
            'amount'       => number_format($payment->amount_poisha / 100, 2, '.', ''),
            'challenge'    => (string) ($opened['challenge'] ?? ''),
        ];

        $complete = $this->post("/api/dfs/check-out/complete/{$reference}", [
            'sensitiveData'       => $this->encrypt($sensitive),
            'signature'           => $this->sign($sensitive),
            'merchantCallbackURL' => url('/api/payments/callback/nagad'),
        ]);

        if (($complete['status'] ?? '') !== 'Success' || empty($complete['callBackUrl'])) {
            throw new RuntimeException(
                'Nagad refused the payment: ' . ($complete['message'] ?? 'no answer')
            );
        }

        $payment->update([
            'gateway_ref' => $reference,
            'response'    => $complete,
        ]);

        return (string) $complete['callBackUrl'];
    }

    public function finalise(array $query): PaymentOutcome
    {
        $reference = (string) ($query['payment_ref_id'] ?? '');
        $payment = Payment::query()
            ->where('gateway', 'nagad')->where('gateway_ref', $reference)
            ->latest('id')->first();

        if ($payment === null) {
            return new PaymentOutcome(null, false, null, 'Unknown Nagad payment reference.');
        }

        if (strcasecmp((string) ($query['status'] ?? ''), 'Aborted') === 0) {
            $payment->update(['status' => 'cancelled', 'response' => $query]);

            return new PaymentOutcome($payment, false, null, 'Payment was cancelled.');
        }

        // The verdict. Redirect parameters are a claim; this call is the fact.
        $verified = (array) Http::timeout(30)
            ->withHeaders($this->headers())
            ->get($this->base() . "/api/dfs/verify/payment/{$reference}")
            ->json();

        $paid = ($verified['status'] ?? '') === 'Success';

        $payment->update([
            'status'   => $paid ? 'completed' : 'failed',
            'trx_id'   => $verified['issuerPaymentRefNo'] ?? null,
            'response' => $verified,
        ]);

        return new PaymentOutcome(
            $payment,
            $paid,
            $verified['issuerPaymentRefNo'] ?? null,
            $paid ? 'Payment completed.' : ($verified['message'] ?? 'Payment failed.'),
        );
    }

    /* ---- transport ---------------------------------------------------- */

    private function post(string $path, array $body): array
    {
        return (array) Http::timeout(30)
            ->withHeaders($this->headers())
            ->post($this->base() . $path, $body)
            ->json();
    }

    private function headers(): array
    {
        return [
            'X-KM-Api-Version' => 'v-0.2.0',
            'X-KM-IP-V4'       => request()->ip() ?? '127.0.0.1',
            'X-KM-Client-Type' => 'PC_WEB',
        ];
    }

    private function base(): string
    {
        return rtrim((string) config('services.nagad.base_url'), '/');
    }

    /* ---- cryptography -------------------------------------------------- */

    /** JSON → RSA (Nagad's public key) → base64. What they can read, others cannot. */
    private function encrypt(array $data): string
    {
        $key = openssl_pkey_get_public($this->pem('PUBLIC', (string) config('services.nagad.public_key')));

        if ($key === false || ! openssl_public_encrypt(json_encode($data), $out, $key)) {
            throw new RuntimeException('Nagad public key is unusable — check NAGAD_PUBLIC_KEY.');
        }

        return base64_encode($out);
    }

    /** JSON → SHA256 signature (our private key) → base64. Proof it was us. */
    private function sign(array $data): string
    {
        $key = openssl_pkey_get_private($this->pem('PRIVATE', (string) config('services.nagad.private_key')));

        if ($key === false || ! openssl_sign(json_encode($data), $out, $key, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Merchant private key is unusable — check NAGAD_PRIVATE_KEY.');
        }

        return base64_encode($out);
    }

    /** base64 (their answer) → RSA (our private key) → array. */
    private function decrypt(string $payload): array
    {
        $key = openssl_pkey_get_private($this->pem('PRIVATE', (string) config('services.nagad.private_key')));

        if ($key === false || ! openssl_private_decrypt(base64_decode($payload), $out, $key)) {
            throw new RuntimeException('Could not decrypt Nagad\'s answer — check the key pair.');
        }

        return (array) json_decode($out, true);
    }

    /**
     * .env carries the key body as one base64 line; OpenSSL wants PEM armour
     * and 64-column wrapping. Rebuild it here so the .env stays single-line.
     */
    private function pem(string $type, string $base64): string
    {
        $body = trim(preg_replace('/\s+/', '', $base64) ?? '');

        return "-----BEGIN {$type} KEY-----\n"
            . chunk_split($body, 64, "\n")
            . "-----END {$type} KEY-----\n";
    }
}
