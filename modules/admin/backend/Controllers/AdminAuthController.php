<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Modules\Admin\Requests\AdminLoginRequest;
use Modules\Admin\Requests\ChangePasswordRequest;
use Modules\Admin\Services\AdminAuthService;

/**
 * Staff sign-in / sign-out / whoami.
 *
 * Session-cookie based, not a bearer token. The admin panel is a first-party
 * browser app on the same origin, so an httpOnly session cookie is strictly
 * safer than a token in localStorage — a single XSS in an admin screen would
 * hand a token straight to the attacker, while an httpOnly cookie cannot be
 * read by script at all.
 */
class AdminAuthController extends Controller
{
    public function __construct(
        private readonly AdminAuthService $auth,
    ) {
    }

    /** POST /api/admin/login */
    public function login(AdminLoginRequest $request): JsonResponse
    {
        $user = $this->auth->attempt(
            $request->string('email')->toString(),
            $request->string('password')->toString(),
            $request->ip(),
        );

        if ($user === null) {
            // One message for every failure mode. See AdminAuthService::attempt.
            return response()->json([
                'message' => 'Those details did not match an active staff account.',
            ], 422);
        }

        $request->session()->regenerate();          // kills session fixation
        auth('admin')->login($user, remember: false);

        return response()->json(['data' => $user->toAdminArray()]);
    }

    /** POST /api/admin/logout */
    public function logout(Request $request): JsonResponse
    {
        auth('admin')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Signed out.']);
    }

    /**
     * GET /api/admin/me
     *
     * The client calls this on load to decide what to render. It is behind the
     * admin middleware, so an unauthenticated call gets 401 and the shell
     * redirects to the login screen — which is also the only reason the
     * client-side guard can be honest about being a convenience.
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user('admin')->toAdminArray()]);
    }

    /**
     * POST /api/admin/password — change your OWN password.
     *
     * Behind `admin` and nothing narrower, because every role needs it. This
     * is the piece that makes generated credentials honest: AdminStaffController
     * mints a twenty-character password and shows it once, and without a way
     * for the person holding it to replace it with something they can actually
     * remember, that password is permanent and lives on whatever they wrote it
     * down on.
     *
     * WHY THE CURRENT PASSWORD IS STILL REQUIRED
     * ------------------------------------------
     * The session already proves who this is, so the field looks redundant.
     * It is not, because the threat here is not a forged session — it is a
     * signed-in browser left open on a shop counter. Without this field,
     * "walk past an unattended laptop, change the password, own the account"
     * costs an attacker four seconds.
     */
    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        $user = $request->user('admin');

        if (! Hash::check($request->string('current')->toString(), $user->password)) {
            /* 422, not 401. The session is perfectly good; the answer was
               wrong. A 401 would trip adminFetch's own interceptor and send
               the browser to the login page, turning a typo into what looks
               like an expired session. */
            return response()->json(['message' => 'That is not your current password.'], 422);
        }

        $user->forceFill([
            'password' => $request->string('password')->toString(),   // hashed by the cast
            // Somebody who has just proved they know the old password should
            // not still be carrying a lockout from guessing at it.
            'failed_attempts' => 0,
            'locked_until'    => null,
        ])->save();

        /* The current session survives, which is what anybody expects and
           saves a re-login in the middle of whatever they were doing: the
           session guard authenticates from the session payload rather than by
           re-checking the hash on each request.

           That also means OTHER browsers already signed in as this account
           stay signed in. Ending those would need Laravel's AuthenticateSession
           middleware on the admin stack, which is a change to how every admin
           request is authenticated and does not belong in a password form. */
        return response()->json([
            'message' => 'Password changed. Use the new one the next time you sign in.',
        ]);
    }
}
