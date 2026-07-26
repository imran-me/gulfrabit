<?php

declare(strict_types=1);

namespace Modules\Auth\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Modules\Auth\Requests\LoginRequest;
use Modules\Auth\Requests\OtpRequestRequest;
use Modules\Auth\Requests\OtpVerifyRequest;
use Modules\Auth\Requests\RegisterRequest;
use Modules\Auth\Services\AuthService;
use Modules\Auth\Services\OtpService;
use RuntimeException;

/**
 * Sign-in, sign-up and the OTP flow.
 *
 * OTP is the primary path and password is the fallback — the order this market
 * actually uses.
 */
class AuthController extends Controller
{
    private const GUEST_CART_COOKIE = 'gr_cart';

    public function __construct(
        private readonly AuthService $auth,
        private readonly OtpService $otp,
    ) {
    }

    /**
     * POST /api/auth/otp/request
     *
     * Always responds 200, whether or not an account exists. Saying "no account
     * for that number" would turn this into a free tool for checking which
     * numbers shop here.
     */
    public function requestOtp(OtpRequestRequest $request): JsonResponse
    {
        try {
            $this->otp->issue($request->validated('phone'), $request->ip());
        } catch (RuntimeException $e) {
            // The resend cooldown is the one thing worth telling them, because
            // it is actionable and not a disclosure.
            return response()->json(['message' => $e->getMessage()], 429);
        }

        return response()->json([
            'message' => 'If that number can receive SMS, a code is on its way.',
            'expiresInMinutes' => \Modules\Auth\Models\OtpCode::TTL_MINUTES,
        ]);
    }

    /**
     * POST /api/auth/otp/verify
     * Verifying a code signs in and, for a new number, creates the account.
     */
    public function verifyOtp(OtpVerifyRequest $request): JsonResponse
    {
        $phone = $this->otp->verify($request->validated('phone'), $request->validated('code'));

        if ($phone === null) {
            // One generic failure for wrong / expired / never-issued.
            return response()->json(['message' => 'That code is not valid.'], 422);
        }

        $session = $this->auth->loginWithVerifiedPhone(
            $phone,
            $request->cookie(self::GUEST_CART_COOKIE),
        );

        return response()->json(['data' => $session]);
    }

    /** POST /api/auth/login — password fallback. */
    public function login(LoginRequest $request): JsonResponse
    {
        $session = $this->auth->loginWithPassword(
            $request->validated('identifier'),
            $request->validated('password'),
            $request->cookie(self::GUEST_CART_COOKIE),
        );

        if ($session === null) {
            // Never distinguish "no such account" from "wrong password".
            return response()->json(['message' => 'Those details did not match.'], 422);
        }

        return response()->json(['data' => $session]);
    }

    /** POST /api/auth/register — explicit sign-up with a password. */
    public function register(RegisterRequest $request): JsonResponse
    {
        $user = User::create([
            'name'     => $request->validated('name'),
            'phone'    => $this->otp->normalise($request->validated('phone')),
            'email'    => $request->validated('email'),
            // Hashed by the model cast; never hash again here or the password
            // becomes unverifiable.
            'password' => $request->validated('password'),
        ]);

        return response()->json([
            'data' => [
                'user'  => $this->auth->publicUser($user),
                'token' => $user->createToken('storefront')->plainTextToken,
            ],
        ], 201);
    }

    /** POST /api/auth/logout — revoke only the token that made this request. */
    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }

    /** GET /api/auth/me */
    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->auth->publicUser($request->user())]);
    }

    /**
     * PATCH /api/auth/me — set or change the password.
     *
     * Requires the current password unless the account has never had one (an
     * OTP-created account), which is why AuthService gives those a random
     * unusable hash rather than an empty string.
     */
    public function updatePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'currentPassword' => ['nullable', 'string'],
            'password'        => ['required', 'confirmed', 'string', 'min:8'],
        ]);

        $user = $request->user();

        if ($validated['currentPassword'] !== null
            && ! Hash::check($validated['currentPassword'], $user->password)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }

        $user->forceFill(['password' => $validated['password']])->save();

        // Changing a password should end every other session — that is the
        // whole point of changing it after a suspected compromise.
        $user->tokens()->where('id', '!=', $user->currentAccessToken()?->id)->delete();

        return response()->json(['message' => 'Password updated.']);
    }
}
