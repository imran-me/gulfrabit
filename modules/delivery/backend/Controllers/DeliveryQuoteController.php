<?php

declare(strict_types=1);

namespace Modules\Delivery\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Delivery\Requests\ShippingQuoteRequest;
use Modules\Delivery\Services\DeliveryQuoteService;

/**
 * Delivery pricing endpoints.
 *
 * Thin by design: validation lives in the FormRequest, pricing rules live in
 * DeliveryQuoteService, and this class only shapes HTTP.
 */
class DeliveryQuoteController extends Controller
{
    public function __construct(
        private readonly DeliveryQuoteService $quotes,
    ) {
    }

    /**
     * GET /api/delivery/options
     * Every active zone — used to render the checkout list before a district is
     * chosen, and by the Shipping & Returns policy table.
     */
    public function options(): JsonResponse
    {
        return response()->json([
            'data' => $this->quotes->options(),
        ]);
    }

    /**
     * GET /api/delivery/districts
     * The 64 districts grouped by division, for the checkout select.
     */
    public function districts(): JsonResponse
    {
        return response()->json([
            'data' => $this->quotes->districtsByDivision(),
        ]);
    }

    /**
     * POST /api/delivery/quote
     * The charge for one district. 422 rather than a default rate when the
     * district is unknown — silently quoting the cheaper zone would undercharge
     * and the order would ship at a loss.
     */
    public function quote(ShippingQuoteRequest $request): JsonResponse
    {
        $quote = $this->quotes->quoteForDistrict($request->districtKey());

        if ($quote === null) {
            return response()->json([
                'message' => 'We do not currently deliver to that district.',
                'errors'  => ['district' => ['Unserviceable district.']],
            ], 422);
        }

        return response()->json(['data' => $quote]);
    }
}
