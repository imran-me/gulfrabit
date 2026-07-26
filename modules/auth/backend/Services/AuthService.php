<?php

declare(strict_types=1);

namespace Modules\Auth\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Modules\Cart\Services\CartService;

/**
 * Account creation and sign-in.
 *
 * Phone-first throughout: `users.phone` is the unique key and email is
 * optional. That is the inverse of the Laravel default and it is the correct
 * shape for this market — checkout collects a phone, order tracking looks up by
 * phone, and a large share of customers have no email at all.
 */
final class AuthService
{
    public function __construct(
        private readonly OtpService $otp,
        private readonly CartService $carts,
    ) {
    }

    /**
     * Find or create the account behind a verified phone number.
     *
     * OTP login doubles as registration: a customer who has just proven they
     * control the number should not then be asked to "sign up". Ghorer Bazar
     * and Shajgoj both work this way, and the extra step is pure drop-off.
     */
    public function loginWithVerifiedPhone(string $phone, ?string $guestCartToken = null): array
    {
        return DB::transaction(function () use ($phone, $guestCartToken): array {
            $user = User::firstOrCreate(
                ['phone' => $phone],
                [
                    // A placeholder name is better than blocking the login. The
                    // account page prompts for a real one.
                    'name'              => 'GulfRabit customer',
                    // Random, unusable password: the account is OTP-only until
                    // the customer chooses to set one. Never leave it empty or
                    // nullable — an empty hash is a login bypass waiting to be
                    // found.
                    'password'          => Hash::make(bin2hex(random_bytes(32))),
                    'phone_verified_at' => now(),
                ],
            );

            if ($user->phone_verified_at === null) {
                $user->forceFill(['phone_verified_at' => now()])->save();
            }

            return $this->issueSession($user, $guestCartToken);
        });
    }

    /** Password sign-in, kept as the fallback path for customers who set one. */
    public function loginWithPassword(string $identifier, string $password, ?string $guestCartToken = null): ?array
    {
        $identifier = trim($identifier);

        // Accept either a phone or an email in the same field — asking the
        // customer which one they used is a question they should not have to
        // answer. Shajgoj label it "Email or phone number" for the same reason.
        $user = str_contains($identifier, '@')
            ? User::where('email', $identifier)->first()
            : User::where('phone', $this->otp->normalise($identifier))->first();

        // Hash::check against a dummy when the user is missing, so the response
        // time does not reveal whether the account exists.
        if ($user === null) {
            Hash::check($password, '$2y$12$usesomesillystringfosomethingxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
            return null;
        }

        if (! Hash::check($password, $user->password)) {
            return null;
        }

        return $this->issueSession($user, $guestCartToken);
    }

    /**
     * Mint a token and fold in whatever the customer built while logged out.
     *
     * The cart merge belongs here rather than in the controller: every sign-in
     * path must do it, and one that forgets silently throws away a basket.
     */
    private function issueSession(User $user, ?string $guestCartToken): array
    {
        if ($guestCartToken) {
            $this->carts->mergeGuestIntoUser($guestCartToken, (int) $user->id);
        }

        return [
            'user'  => $this->publicUser($user),
            'token' => $user->createToken('storefront')->plainTextToken,
        ];
    }

    /** Never let the password hash or internal columns reach a response. */
    public function publicUser(User $user): array
    {
        return [
            'id'            => $user->id,
            'name'          => $user->name,
            'phone'         => $user->phone,
            'email'         => $user->email,
            'tier'          => $user->tier,
            'phoneVerified' => $user->phone_verified_at !== null,
        ];
    }
}
