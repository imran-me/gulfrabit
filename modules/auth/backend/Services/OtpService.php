<?php

declare(strict_types=1);

namespace Modules\Auth\Services;

use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Modules\Auth\Models\OtpCode;
use RuntimeException;

/**
 * Issues and verifies one-time login codes.
 *
 * Every rule here exists because this endpoint costs real money per call and is
 * trivially scriptable. Treat it as the most abusable surface in the app.
 */
final class OtpService
{
    /**
     * Issue a code for a phone number.
     *
     * @throws RuntimeException when the caller is asking again too soon
     */
    public function issue(string $phone, ?string $ip = null): OtpCode
    {
        $phone = $this->normalise($phone);

        $recent = OtpCode::query()
            ->where('phone', $phone)
            ->where('created_at', '>', now()->subSeconds(OtpCode::RESEND_COOLDOWN_SECONDS))
            ->latest('id')
            ->first();

        if ($recent !== null) {
            $wait = OtpCode::RESEND_COOLDOWN_SECONDS
                - now()->diffInSeconds($recent->created_at);
            throw new RuntimeException("Please wait {$wait} seconds before requesting another code.");
        }

        // Any earlier live code is invalidated: two valid codes at once doubles
        // the guessing surface for no benefit.
        OtpCode::query()->where('phone', $phone)->usable()->update(['consumed_at' => now()]);

        $code = $this->generateCode();

        $otp = OtpCode::create([
            'phone'      => $phone,
            'code_hash'  => Hash::make($code),
            'expires_at' => now()->addMinutes(OtpCode::TTL_MINUTES),
            'request_ip' => $ip,
        ]);

        $this->deliver($phone, $code);

        return $otp;
    }

    /**
     * Check a submitted code. Returns the normalised phone on success.
     *
     * Deliberately returns one generic failure for "wrong code", "expired" and
     * "no code requested" — distinguishing them tells an attacker which phone
     * numbers have live codes.
     */
    public function verify(string $phone, string $code): ?string
    {
        $phone = $this->normalise($phone);

        $otp = OtpCode::query()
            ->where('phone', $phone)
            ->usable()
            ->latest('id')
            ->first();

        if ($otp === null) {
            return null;
        }

        // Count the attempt BEFORE checking, so a crash mid-verify cannot be
        // used to get unlimited free guesses.
        $otp->increment('attempts');

        if (! Hash::check($code, $otp->code_hash)) {
            return null;
        }

        $otp->update(['consumed_at' => now()]);

        return $phone;
    }

    /**
     * Six digits, from a cryptographically secure source.
     *
     * random_int, not rand(): a predictable OTP is not an OTP. Leading zeros are
     * preserved by padding, or a "0" prefix would silently shrink the keyspace.
     */
    private function generateCode(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Hand the code to an SMS provider.
     *
     * // TODO: integrate a Bangladeshi SMS gateway. Until then the code is
     * written to the log so local development can complete a login. This MUST
     * be replaced before the site takes real customers — logging live login
     * codes in production is a credential leak.
     */
    private function deliver(string $phone, string $code): void
    {
        if (app()->isProduction()) {
            // Fail loudly rather than silently logging secrets in production.
            throw new RuntimeException('No SMS gateway configured — cannot deliver OTP.');
        }

        Log::info("[dev] OTP for {$phone}: {$code}");
    }

    /** 8801712345678 / +8801712345678 -> 01712345678, so lookups match. */
    public function normalise(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        if (str_starts_with($digits, '88')) {
            $digits = substr($digits, 2);
        }

        return $digits;
    }
}
