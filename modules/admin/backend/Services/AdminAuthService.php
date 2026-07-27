<?php

declare(strict_types=1);

namespace Modules\Admin\Services;

use Illuminate\Support\Facades\Hash;
use Modules\Admin\Models\AdminUser;

/**
 * Staff sign-in.
 *
 * The rules here are stricter than the storefront's on purpose: there are five
 * accounts, not fifty thousand, so an attacker guessing at them is never a
 * customer having a bad day. Slow it down and lock it.
 */
final class AdminAuthService
{
    /** Failures before the account is locked. */
    private const MAX_ATTEMPTS = 5;

    /** How long the lock lasts. Long enough to make guessing pointless. */
    private const LOCK_MINUTES = 15;

    /**
     * Attempt a sign-in.
     *
     * Returns null for EVERY failure — wrong email, wrong password, disabled
     * account, locked account. The caller cannot tell which, and neither can
     * an attacker: "no such account" confirms which addresses are staff, and
     * "account locked" confirms the address exists AND that someone is already
     * attacking it.
     *
     * The one exception is the timing side-channel. A missing account would
     * otherwise return instantly while a real one pays for a bcrypt compare,
     * which leaks exactly what the uniform message hides — so a miss burns a
     * hash too.
     */
    public function attempt(string $email, string $password, ?string $ip = null): ?AdminUser
    {
        $user = AdminUser::query()->where('email', $email)->first();

        if ($user === null) {
            // Constant-ish work for an unknown address. The hash is discarded;
            // the point is the elapsed time.
            Hash::check($password, '$2y$12$usesomesillystringfor.eZ8pXjZ0WSKhLPeF3qMTfB4S3zHXe');
            return null;
        }

        if ($user->isLocked() || ! $user->is_active) {
            return null;
        }

        if (! Hash::check($password, $user->password)) {
            $this->recordFailure($user);
            return null;
        }

        $user->forceFill([
            'failed_attempts' => 0,
            'locked_until'    => null,
            'last_login_at'   => now(),
            'last_login_ip'   => $ip,
        ])->save();

        return $user;
    }

    private function recordFailure(AdminUser $user): void
    {
        $attempts = $user->failed_attempts + 1;

        $user->forceFill([
            'failed_attempts' => $attempts,
            'locked_until'    => $attempts >= self::MAX_ATTEMPTS
                ? now()->addMinutes(self::LOCK_MINUTES)
                : null,
        ])->save();
    }
}
