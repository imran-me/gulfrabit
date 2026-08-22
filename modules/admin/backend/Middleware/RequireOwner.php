<?php

declare(strict_types=1);

namespace Modules\Admin\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Deleting is an owner's decision, everywhere in the panel.
 *
 * WHY THIS IS NOT A CAPABILITY
 * ----------------------------
 * `admin:orders` answers "may this person work orders?". Deleting is a
 * different question — "may this person make a record stop existing?" — and it
 * has the same answer on every screen regardless of the area. Modelling it as
 * a capability would have meant adding `orders.delete`, `products.delete`,
 * `media.delete` … to AdminUser::CAPABILITIES: five roles times a dozen areas
 * of matrix for a rule that is one sentence long.
 *
 * So it stacks on top of the area check instead. A route reads:
 *
 *     ->middleware(['admin:orders', 'admin.owner'])
 *
 * which is "you must be able to work orders, AND you must be an owner" — the
 * area check still runs first, so a warehouse account is told it cannot reach
 * orders at all rather than being told it is not an owner, which would confirm
 * the screen exists.
 *
 * The panel also hides delete controls from non-owners, but that is courtesy.
 * This is the control. Every destructive endpoint in the panel is behind it.
 */
class RequireOwner
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user('admin');

        // Unauthenticated cannot happen in practice — `admin` always runs
        // first and would have returned 401 — but a middleware that assumes
        // its neighbour ran is a middleware that breaks silently the day
        // somebody applies it on its own.
        if ($user === null || ! $user->is_active) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user->role !== 'owner') {
            return response()->json([
                'message' => 'Only an owner can delete. Ask an owner to do this, '
                    . 'or archive the record instead.',
            ], 403);
        }

        return $next($request);
    }
}
