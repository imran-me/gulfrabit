<?php

declare(strict_types=1);

namespace Modules\Account\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Models\Order;

/**
 * A customer's own orders.
 *
 * WHY IT EXISTS NOW. The account screens have read a fixture plus localStorage
 * since they were written — `getOrders()` in backend/api.js still says
 * "TODO: backend". That was harmless while the page only listed things, and it
 * stopped being harmless the moment "Review this" appeared on a delivered
 * line: the link came off a fixture order, the review endpoint checks the real
 * orders table, and a customer clicking it would be told they had not bought
 * the thing they were looking at a receipt for.
 *
 * RESOLVED THROUGH THE OWNER, never fetched and then compared. Every query
 * here starts from `$request->user()`, so there is no id in a URL that could
 * be edited into somebody else's history — the rule in CONVENTIONS.md, and the
 * one place a read endpoint most easily gets it wrong.
 */
class OrderHistoryController extends Controller
{
    /**
     * GET /api/account/orders
     *
     * Snapshot lines, exactly as they were bought. Nothing here reads through
     * to the live product: an order is a historical record, and a rename or a
     * reprice must not rewrite what somebody sees they paid.
     */
    public function index(Request $request): JsonResponse
    {
        $orders = Order::query()
            ->where('user_id', $request->user()->id)
            ->with('items')
            ->latest('placed_at')
            ->latest('id')
            ->limit(100)
            ->get();

        return response()->json([
            'data' => $orders->map(fn (Order $o): array => [
                // `id` rather than `orderNumber`, because that is the key the
                // account pages already use everywhere — the tracking link,
                // the de-duplication against locally-placed orders, and the
                // filter chips. The order number IS the public key here; there
                // is no auto-increment id in this payload on purpose.
                'id'     => $o->order_number,
                'date'   => $o->placed_at?->toDateString(),
                'status' => $o->status,
                'total'  => intdiv((int) $o->total_poisha, 100),
                'items'  => $o->items->map(fn ($it): array => [
                    // The SKU, which productURL() resolves the same as a slug —
                    // and which is on the snapshot, so it survives the product
                    // being deleted for good.
                    'id'      => $it->sku,
                    'title'   => $it->title,
                    'qty'     => (int) $it->qty,
                    'price'   => intdiv((int) $it->unit_price_poisha, 100),
                    'image'   => $it->image,
                    'variant' => $it->variant,
                ])->all(),
            ])->all(),
        ]);
    }
}
