<?php

declare(strict_types=1);

namespace Modules\Sms\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Sms\Models\SmsLog;
use Throwable;

/**
 * Sending one SMS, and being honest about whether it went.
 *
 * THE CONTRACT, SAME AS EVERY CONFIGURABLE THING IN THIS CODEBASE
 * ---------------------------------------------------------------
 * No credentials in .env → this class does NOTHING, silently and cheaply. A
 * half-configured sender that throws inside an admin's "Mark confirmed" click
 * would turn a missing API key into a broken orders screen — the SMS is the
 * garnish, the status change is the meal, and the garnish must never take the
 * meal down. Nothing here ever throws past its own walls.
 *
 * THE GATEWAY
 * -----------
 * bulksmsbd.net, because it is what small BD merchants actually use: prepaid
 * credit, an HTTP GET, a JSON answer. One request per SMS — there is no queue
 * worker on shared hosting, and at this shop's volume (a handful of orders a
 * day, two SMS each) a 2-second synchronous call inside an admin action is
 * cheaper than operating a queue. If volume ever makes that wrong, this class
 * is the one place to change.
 *
 * `SMS_GATEWAY=log` sends nothing and writes the message to laravel.log and
 * sms_logs instead — the way to see exactly what customers WOULD receive
 * before buying credit.
 *
 * EVERY ATTEMPT IS LOGGED to sms_logs — sent or failed, with the gateway's
 * answer. Prepaid SMS credit that silently runs out otherwise looks exactly
 * like a working system: the panel keeps clicking, the customer hears nothing.
 * The log table is the difference between "we sent it" and "we think we did".
 */
final class SmsService
{
    /** bulksmsbd's "message submitted successfully" code. */
    private const BULKSMSBD_OK = 202;

    public function configured(): bool
    {
        $gateway = (string) config('services.sms.gateway');

        if ($gateway === 'log') {
            return true;
        }

        return $gateway === 'bulksmsbd'
            && (string) config('services.sms.api_key') !== ''
            && (string) config('services.sms.sender_id') !== '';
    }

    /**
     * Fire one SMS at one Bangladeshi number. Returns whether the gateway
     * accepted it — and never throws, whatever goes wrong.
     */
    public function send(string $phone, string $body, ?int $orderId = null): bool
    {
        if (! $this->configured()) {
            return false;
        }

        $number = $this->normalise($phone);
        if ($number === null) {
            // A malformed number is a data bug worth a log line, not an SMS
            // silently aimed at nothing.
            Log::warning('[sms] unsendable phone number', ['phone' => $phone, 'order_id' => $orderId]);

            return false;
        }

        $gateway = (string) config('services.sms.gateway');

        try {
            [$ok, $response] = $gateway === 'log'
                ? $this->sendToLog($number, $body)
                : $this->sendViaBulkSmsBd($number, $body);
        } catch (Throwable $e) {
            [$ok, $response] = [false, $e->getMessage()];
        }

        try {
            SmsLog::create([
                'order_id' => $orderId,
                'phone'    => $number,
                'body'     => $body,
                'gateway'  => $gateway,
                'status'   => $ok ? 'sent' : 'failed',
                'response' => mb_substr((string) $response, 0, 1000),
            ]);
        } catch (Throwable $e) {
            // The sms_logs table missing (migration not yet run) must not
            // unsend a sent SMS or break the caller. Note it and move on.
            Log::warning('[sms] could not record attempt', ['error' => $e->getMessage()]);
        }

        if (! $ok) {
            Log::warning('[sms] gateway refused message', ['phone' => $number, 'response' => $response]);
        }

        return $ok;
    }

    /** @return array{0: bool, 1: string} */
    private function sendViaBulkSmsBd(string $number, string $body): array
    {
        $response = Http::timeout(10)->get('http://bulksmsbd.net/api/smsapi', [
            'api_key'  => config('services.sms.api_key'),
            'type'     => 'text',
            'number'   => $number,
            'senderid' => config('services.sms.sender_id'),
            'message'  => $body,
        ]);

        $code = (int) ($response->json('response_code') ?? 0);

        return [$code === self::BULKSMSBD_OK, $response->body()];
    }

    /** @return array{0: bool, 1: string} */
    private function sendToLog(string $number, string $body): array
    {
        Log::info("[sms] (log driver) to {$number}: {$body}");

        return [true, 'log driver — nothing sent'];
    }

    /**
     * 01894715151 / +8801894715151 / 8801894715151 → 8801894715151.
     * bulksmsbd wants the country-code form; anything that cannot be read as a
     * BD mobile number is refused rather than guessed at.
     */
    private function normalise(string $phone): ?string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        if (str_starts_with($digits, '880')) {
            $digits = substr($digits, 2);
        }

        return preg_match('/^01[3-9]\d{8}$/', $digits) === 1 ? '88' . $digits : null;
    }
}
