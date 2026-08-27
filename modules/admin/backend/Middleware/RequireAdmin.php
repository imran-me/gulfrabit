<?php

declare(strict_types=1);

namespace Modules\Admin\Middleware;

use Closure;
use Illuminate\Http\Request;
use Modules\Admin\Models\AdminUser;
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
 * Usage:  ->middleware(['admin'])                any signed-in staff member
 *         ->middleware(['admin:accounting'])      may OPEN the books
 *         ->middleware(['admin:orders.delete'])   may delete an order
 *
 * A bare area is shorthand for that area's `view` permission, so every route
 * written before per-account permissions existed keeps working with no edit.
 * Anything with a dot in it is checked literally.
 */
class RequireAdmin
{
    public function handle(Request $request, Closure $next, ?string $ability = null): Response
    {
        $user = $request->user('admin');

        if ($user === null || ! $user->is_active) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // 403 is correct here, unlike the storefront's 404-for-other-people's-
        // resources rule. The staff member is authenticated and known; hiding
        // the existence of the accounting area from the warehouse team buys
        // nothing and makes a permissions problem look like a broken link.
        if ($ability !== null) {
            /* `admin:orders` means `orders.view`. The shorthand is not
               sugar — it is what keeps thirty route groups across nine
               modules working unchanged now that permissions are finer than
               the areas those routes were written against. */
            $permission = str_contains($ability, '.') ? $ability : "{$ability}.view";

            if (! $user->may($permission)) {
                return response()->json(['message' => $this->refusal($permission)], 403);
            }
        }

        return $next($request);
    }

    /**
     * The refusal, in the words the staff screen uses.
     *
     * "Your role does not have access to this area" stopped being true once
     * permissions could be set per account — somebody refused here may well
     * share a role with a colleague who is not. And naming the permission in
     * the panel's own language ("Authorise refunds" rather than
     * `orders.refund`) means the person reading it can ask an owner for the
     * exact box that needs ticking, rather than for vague more access.
     */
    private function refusal(string $permission): string
    {
        [$area, $action] = array_pad(explode('.', $permission, 2), 2, 'view');

        $areaLabel = AdminUser::AREA_LABELS[$area] ?? $area;

        if ($action === 'view') {
            return "Your account cannot open {$areaLabel}. Ask an owner for access.";
        }

        $actionLabel = mb_strtolower(AdminUser::ACTION_LABELS[$action] ?? $action);

        return "Your account can open {$areaLabel} but cannot {$actionLabel} there. "
            . 'Ask an owner to turn that on.';
    }
}
