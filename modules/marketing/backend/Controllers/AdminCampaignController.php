<?php

declare(strict_types=1);

namespace Modules\Marketing\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Models\Order;

/**
 * Orders and revenue, grouped by the ad that recruited them.
 *
 * This is the report the ad_source column exists for: Meta's dashboard knows
 * what each campaign SPENT, the orders table knows what each campaign SOLD,
 * and a merchant deciding tomorrow's budget needs the two side by side. The
 * spend side stays in Meta (pulling it needs the Marketing API and adds an
 * integration for a number Ads Manager already shows); this screen owns the
 * selling side, in taka, next to the organic baseline.
 *
 * Aggregated in PHP rather than SQL JSON functions on purpose: the grouping
 * key falls back through utm_campaign → utm_source → organic, which is three
 * COALESCEs over JSON extracts in MySQL — and the rows for a period are a few
 * thousand at most. Correct and readable beats clever here.
 */
class AdminCampaignController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'days' => ['sometimes', 'integer', 'in:7,30,90,365'],
        ]);
        $days = (int) ($data['days'] ?? 30);

        $orders = Order::query()
            ->where('created_at', '>=', now()->subDays($days))
            ->get(['ad_source', 'total_poisha', 'status', 'created_at']);

        $rows = [];

        foreach ($orders as $order) {
            $src = $order->ad_source;

            // The fallback chain IS the report's grouping rule: campaign when
            // the ad was tagged properly, source when only that survived, and
            // one honest bucket for visitors nobody paid for.
            $key = $src['utm_campaign'] ?? $src['utm_source'] ?? '(organic)';

            $rows[$key] ??= [
                'campaign'      => $key,
                'source'        => $src['utm_source'] ?? null,
                'medium'        => $src['utm_medium'] ?? null,
                'orders'        => 0,
                'cancelled'     => 0,
                'revenueTaka'   => 0,
                'lastOrderAt'   => null,
            ];

            $rows[$key]['orders']++;

            if ($order->status === 'cancelled') {
                // Counted, not folded into revenue: a campaign that produces
                // orders which then cancel is a campaign producing junk, and
                // that pattern must be visible, not averaged away.
                $rows[$key]['cancelled']++;
            } else {
                $rows[$key]['revenueTaka'] += intdiv($order->total_poisha, 100);
            }

            $at = $order->created_at?->toIso8601String();
            if ($at !== null && ($rows[$key]['lastOrderAt'] === null || $at > $rows[$key]['lastOrderAt'])) {
                $rows[$key]['lastOrderAt'] = $at;
            }
        }

        // Best seller first; the organic row sinks to its natural place by
        // the same rule as everything else.
        usort($rows, fn (array $a, array $b): int => $b['revenueTaka'] <=> $a['revenueTaka']);

        $adRows = array_filter($rows, fn (array $r): bool => $r['campaign'] !== '(organic)');

        return response()->json([
            'data' => array_values($rows),
            'meta' => [
                'days'          => $days,
                'totalOrders'   => $orders->count(),
                'adOrders'      => array_sum(array_column($adRows, 'orders')),
                'adRevenueTaka' => array_sum(array_column($adRows, 'revenueTaka')),
                'revenueTaka'   => array_sum(array_column($rows, 'revenueTaka')),
            ],
        ]);
    }
}
