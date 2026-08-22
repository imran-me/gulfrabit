<?php

declare(strict_types=1);

namespace Modules\Catalog\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Catalog\Models\Product;
use Modules\Catalog\Models\StockAlert;

/**
 * Registering interest in something that cannot be bought yet.
 *
 * Public and unauthenticated, deliberately: this is asked by a browsing
 * visitor who has not signed in and will abandon the whole idea rather than
 * create an account to be told about saffron. Throttled on the route for the
 * same reason the quote endpoint is.
 */
class StockAlertController extends Controller
{
    /** POST /api/catalog/notify */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sku'   => ['required', 'string', 'max:64'],
            // Loose on purpose. A stricter pattern rejects the perfectly valid
            // ways people write their own number — +880, 0088, spaces — and
            // this is a low-stakes list, not a payment instruction.
            'phone' => ['required', 'string', 'min:6', 'max:24'],
        ]);

        $product = Product::query()->active()->where('sku', $data['sku'])->first();

        if ($product === null) {
            return response()->json(['message' => 'That product is no longer listed.'], 404);
        }

        // Already buyable — answer honestly rather than taking a note nobody
        // will ever act on. This happens for real: a shipment lands while
        // somebody has the page open from an hour ago.
        if ($product->isOrderable()) {
            return response()->json([
                'message'   => "{$product->title} is available now — refresh the page to add it.",
                'orderable' => true,
            ], 409);
        }

        // updateOrCreate, not create: the unique index would otherwise turn an
        // impatient second tap into a 500. Asking twice is one person being
        // impatient, not two people waiting.
        StockAlert::updateOrCreate(
            ['product_id' => $product->id, 'phone' => $this->normalisePhone($data['phone'])],
            // Cleared, so somebody who was told about the LAST restock and is
            // asking again is put back on the list rather than silently
            // skipped for having been messaged once months ago.
            ['notified_at' => null],
        );

        return response()->json([
            'message' => $product->isUpcoming()
                ? 'We will text you when it arrives.'
                : 'We will text you when it is back.',
        ], 201);
    }

    /**
     * The same normalisation the checkout uses, so one person with one number
     * is one row however they typed it.
     */
    private function normalisePhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';

        if (str_starts_with($digits, '880')) {
            $digits = '0' . substr($digits, 3);
        }

        return $digits;
    }
}
