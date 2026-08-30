<?php

declare(strict_types=1);

namespace Modules\Theme\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Theme\Models\CardParts;
use Modules\Theme\Models\SiteSetting;

/**
 * Which parts of a product card the shop shows.
 *
 * There is no public read here on purpose. A product card is on every page, so
 * a second public endpoint would be a second request on every page in the shop
 * — the answer rides on GET /api/theme instead, which every page already asks
 * for. See ThemeController::show().
 */
class CardController extends Controller
{
    /** GET /api/admin/product-card — what the panel shows as live. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => ['card' => CardParts::published()]]);
    }

    /**
     * PUT /api/admin/product-card
     *
     * Normalised rather than validated field by field: fourteen boolean rules
     * generated from the same constant would say the same thing twice and
     * drift, and normalise() is already the function that decides what a valid
     * answer is — the one the storefront trusts. A malformed field becomes
     * "shown", and the screen redraws from the response, so the merchant sees
     * what was actually saved.
     */
    public function update(Request $request): JsonResponse
    {
        $card = CardParts::normalise($request->input('card'));

        SiteSetting::updateOrCreate(
            ['key' => CardParts::KEY],
            [
                'value' => $card,
                'updated_by' => (string) ($request->user()?->name ?? 'admin'),
            ],
        );

        CardParts::forget();

        return response()->json(['data' => ['card' => $card]]);
    }
}
