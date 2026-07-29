<?php

declare(strict_types=1);

namespace Modules\Admin\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The dashboard's numbers.
 *
 * EVERY BLOCK IS OPTIONAL, BY DESIGN
 * ----------------------------------
 * This is the one place in the admin panel that reaches across every module,
 * which makes it the one place most likely to break the module rule. So it
 * asks whether each table exists before touching it, and returns only the
 * cards it could actually fill. Delete modules/inventory and the dashboard
 * loses its stock card; it does not 500.
 *
 * It also filters by the viewer's capabilities. The warehouse role opening the
 * dashboard must not receive today's revenue in the JSON just because the
 * client would have hidden the card — data the client hides is still data the
 * client received.
 */
class AdminDashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user('admin');
        $cards = [];

        if ($user->can('orders') && Schema::hasTable('orders')) {
            $cards['orders'] = $this->orderCards($user->can('accounting') || $user->can('customers'));
        }

        // Quote requests waiting on somebody. This IS the B2B notification:
        // there is no mail credential (context.md 8b/B2), so the thing that
        // actually works is a count nobody can walk past on sign-in.
        if ($user->can('orders') && Schema::hasTable('quote_requests')) {
            $waiting = DB::table('quote_requests')->whereIn('status', ['new', 'reviewing'])->count();
            if ($waiting > 0) {
                $cards['b2b'] = ['quotesWaiting' => $waiting];
            }
        }

        if ($user->can('inventory') && Schema::hasTable('stock_levels')) {
            $cards['inventory'] = $this->inventoryCards();
        }

        if ($user->can('accounting') && Schema::hasTable('journal_entries')) {
            $cards['accounting'] = $this->accountingCards();
        }

        return response()->json([
            'data' => [
                'cards'      => $cards,
                'generatedAt' => now()->toIso8601String(),
            ],
        ]);
    }

    /**
     * @param bool $withMoney whether this viewer may see revenue figures.
     *   The warehouse role gets counts and a fulfilment queue; it does not get
     *   what the day was worth.
     */
    private function orderCards(bool $withMoney): array
    {
        $today = DB::table('orders')->whereDate('placed_at', today());

        $cards = [
            'todayCount'   => (clone $today)->count(),
            // The queue is the actionable number: orders that have been paid
            // for and are waiting on someone in the building.
            'awaitingPack' => DB::table('orders')->whereIn('status', ['placed', 'confirmed'])->count(),
            'shipped'      => DB::table('orders')->where('status', 'shipped')->count(),
        ];

        if ($withMoney) {
            // Only paid orders count toward a revenue figure. Counting placed
            // orders would inflate the day and then quietly deflate it when
            // cash-on-delivery attempts fail.
            $cards['todayRevenueTaka'] = intdiv(
                (int) (clone $today)->where('payment_status', 'paid')->sum('total_poisha'),
                100,
            );
        }

        return $cards;
    }

    private function inventoryCards(): array
    {
        return [
            'lowStock'  => DB::table('stock_levels')->whereColumn('qty_on_hand', '<=', 'reorder_level')->count(),
            'outOfStock' => DB::table('stock_levels')->where('qty_on_hand', '<=', 0)->count(),
        ];
    }

    private function accountingCards(): array
    {
        return [
            'unpostedEntries' => DB::table('journal_entries')->where('is_posted', false)->count(),
        ];
    }
}
