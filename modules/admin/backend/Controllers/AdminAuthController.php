<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Admin\Requests\AdminLoginRequest;
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
}
