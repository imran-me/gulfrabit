<?php

declare(strict_types=1);

namespace Modules\Theme\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Theme\Models\MiniCart;
use Modules\Theme\Models\SiteSetting;

/**
 * Which controls the slide-in mini cart shows.
 *
 * There is no public read here on purpose, for the same reason CardController
 * has none: the drawer is built on every page, so a second public endpoint
 * would be a second request on every page in the shop. The answer rides on
 * GET /api/theme instead — see ThemeController::show().
 */
class MiniCartController extends Controller
{
    /** GET /api/admin/mini-cart — what the panel shows as live. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => ['cart' => MiniCart::published()]]);
    }

    /**
     * PUT /api/admin/mini-cart
     *
     * Normalised rather than validated field by field, the same contract as
     * CardController: normalise() is already the function that decides what a
     * valid answer is — the one the storefront trusts — and a second set of
     * boolean rules generated from the same constant would only drift. A
     * malformed field becomes "shown", and the screen redraws from the
     * response, so the merchant sees what was actually saved.
     */
    public function update(Request $request): JsonResponse
    {
        $cart = MiniCart::normalise($request->input('cart'));

        SiteSetting::updateOrCreate(
            ['key' => MiniCart::KEY],
            [
                'value' => $cart,
                'updated_by' => (string) ($request->user()?->name ?? 'admin'),
            ],
        );

        MiniCart::forget();

        return response()->json(['data' => ['cart' => $cart]]);
    }
}
