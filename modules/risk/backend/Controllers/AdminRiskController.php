<?php

declare(strict_types=1);

namespace Modules\Risk\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Risk\Services\DeliveryRisk;

/**
 * Delivery risk: whether a phone number's parcels come back.
 *
 * Behind the orders capability, because it IS order history read a different
 * way, and because the person it is for is the person deciding whether to put
 * a parcel on a van.
 */
class AdminRiskController extends Controller
{
    public function __construct(private readonly DeliveryRisk $risk)
    {
    }

    /** The shop's own record, and the numbers worth knowing about. */
    public function index(Request $request): JsonResponse
    {
        $days = (int) $request->query('days', 90);
        $days = in_array($days, [30, 90, 180, 365], true) ? $days : 90;

        return response()->json(['data' => [
            'shop'      => $this->risk->shopWide($days),
            'watchlist' => $this->risk->watchlist($days),
        ]]);
    }

    /**
     * One number's record.
     *
     * A GET with the phone in the query string, and deliberately not a route
     * parameter: a phone number in a path ends up in access logs, in browser
     * history and in anything that copies a URL. It is still the shop's own
     * customer either way, but there is no reason to spread it further than
     * the screen that asked.
     */
    public function phone(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone'   => ['required', 'string', 'max:24'],
            'exclude' => ['sometimes', 'nullable', 'string', 'max:24'],
        ]);

        return response()->json(['data' => $this->risk->forPhone(
            $data['phone'],
            $data['exclude'] ?? null,
        )]);
    }
}
