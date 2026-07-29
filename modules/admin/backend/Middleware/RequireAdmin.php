<?php

declare(strict_types=1);

namespace Modules\Admin\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * THE authority for the admin panel.
 *
 * The admin HTML is served as static files, so anyone can open the page. That
 * is fine, and only fine, because the page contains no data — every figure on
 * every screen arrives from an endpoint behind this middleware. The JavaScript
 * guard that redirects to the login screen is a convenience for staff who have
 * signed out; it is not a control and must never be treated as one.
 *
 * Usage:  ->middleware(['admin'])            any signed-in staff member
 *         ->middleware(['admin:accounting'])  only roles with that capability
 */
class RequireAdmin
{
    public function handle(Request $request, Closure $next, ?string $area = null): Response
    {
        $user = $request->user('admin');

        if ($user === null || ! $user->is_active) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // 403 is correct here, unlike the storefront's 404-for-other-people's-
        // resources rule. The staff member is authenticated and known; hiding
        // the existence of the accounting area from the warehouse team buys
        // nothing and makes a permissions problem look like a broken link.
        if ($area !== null && ! $user->canAccess($area)) {
            return response()->json([
                'message' => 'Your role does not have access to this area.',
            ], 403);
        }

        return $next($request);
    }
}
