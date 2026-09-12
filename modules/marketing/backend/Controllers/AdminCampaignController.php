<?php

declare(strict_types=1);

namespace Modules\Marketing\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Checkout\Models\Order;
use Modules\Marketing\Services\AdSpendSettings;
use Modules\Marketing\Services\MetaAdSpend;
use Modules\Marketing\Services\OrderOutcomes;

/**
 * What each campaign cost, what it sold, and what was actually delivered.
 *
 * WHY THE SPEND SIDE MOVED IN HERE
 * --------------------------------
 * This screen used to say, deliberately, that spend stays in Ads Manager:
 * pulling it is an integration for a number Meta already shows you. That was
 * right while the shop could only count orders. It stopped being right the day
 * the Tracking screen could follow a tracked purchase through to DELIVERY.
 *
 * Meta counts a Purchase when "Place order" is pressed. In a cash-on-delivery
 * shop that is a promise: the phone goes unanswered, the parcel is refused,
 * the order was placed for fun. Meta cannot know which, so every
 * return-on-spend figure in Ads Manager is computed against revenue that
 * partly never arrives. The shop knows. With the spend beside it, this screen
 * can answer what Ads Manager cannot - what a DELIVERED order cost, and which
 * campaign is buying cancellations at full price.
 *
 * Aggregated in PHP rather than SQL JSON functions on purpose: the grouping
 * key falls back through utm_campaign → utm_source → organic, which is three
 * COALESCEs over JSON extracts in MySQL — and the rows for a period are a few
 * thousand at most. Correct and readable beats clever here.
 */
class AdminCampaignController extends Controller
{
    public function __construct(
        private readonly MetaAdSpend $spend,
        private readonly AdSpendSettings $spendSettings,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'days' => ['sometimes', 'integer', 'in:7,30,90,365'],
        ]);
        $days = (int) ($data['days'] ?? 30);
        $since = now()->subDays($days);

        $orders = Order::query()
            ->where('created_at', '>=', $since)
            ->get(['ad_source', 'total_poisha', 'status', 'created_at']);

        $rows = [];

        foreach ($orders as $order) {
            $src = $order->ad_source;

            // The fallback chain IS the report's grouping rule: campaign when
            // the ad was tagged properly, source when only that survived, and
            // one honest bucket for visitors nobody paid for.
            $key = $src['utm_campaign'] ?? $src['utm_source'] ?? '(organic)';

            $rows[$key] ??= self::blank($key, $src['utm_source'] ?? null, $src['utm_medium'] ?? null);

            $rows[$key]['orders']++;

            $bucket = OrderOutcomes::bucket($order->status);
            $taka = intdiv($order->total_poisha, 100);

            if ($order->status === 'cancelled') {
                // Counted, not folded into revenue: a campaign that produces
                // orders which then cancel is a campaign producing junk, and
                // that pattern must be visible, not averaged away.
                $rows[$key]['cancelled']++;
            } else {
                $rows[$key]['revenueTaka'] += $taka;
            }

            if ($bucket === 'returned') {
                $rows[$key]['returned']++;
            }

            // Delivered is the only revenue that has been PAID. Everything
            // else on this row is a forecast of some confidence.
            if ($bucket === 'delivered') {
                $rows[$key]['delivered']++;
                $rows[$key]['deliveredTaka'] += $taka;
            }

            $at = $order->created_at?->toIso8601String();
            if ($at !== null && ($rows[$key]['lastOrderAt'] === null || $at > $rows[$key]['lastOrderAt'])) {
                $rows[$key]['lastOrderAt'] = $at;
            }
        }

        $rows = $this->withSpend($rows, $since->toDateString(), now()->toDateString());

        // Best seller first; the organic row sinks to its natural place by
        // the same rule as everything else.
        usort($rows, fn (array $a, array $b): int => $b['revenueTaka'] <=> $a['revenueTaka']);

        $adRows = array_filter($rows, fn (array $r): bool => $r['campaign'] !== '(organic)');
        $spendTaka = array_sum(array_column($rows, 'spendTaka'));
        $adDelivered = array_sum(array_column($adRows, 'deliveredTaka'));
        $adRevenue = array_sum(array_column($adRows, 'revenueTaka'));

        return response()->json([
            'data' => array_values($rows),
            'meta' => [
                'days'            => $days,
                'totalOrders'     => $orders->count(),
                'adOrders'        => array_sum(array_column($adRows, 'orders')),
                'adRevenueTaka'   => $adRevenue,
                'revenueTaka'     => array_sum(array_column($rows, 'revenueTaka')),
                'deliveredTaka'   => array_sum(array_column($rows, 'deliveredTaka')),
                'spendTaka'       => $spendTaka,
                'adDeliveredTaka' => $adDelivered,
                // Blended, and named so: this is every ad taka against every
                // taka the ads sold, not one campaign's performance.
                'roas'            => $spendTaka > 0 ? round($adRevenue / $spendTaka, 2) : null,
                'roasDelivered'   => $spendTaka > 0 ? round($adDelivered / $spendTaka, 2) : null,
                'spend'           => $this->spendSettings->current(),
            ],
        ]);
    }

    /**
     * Attach each campaign's spend, and the three numbers that need it.
     *
     * Spend that matches no campaign gets its own row rather than being
     * dropped: money spent on an ad whose link carries no utm tags is real,
     * common, and invisible everywhere else — and the row is how the merchant
     * finds out the tags are missing.
     *
     * @param  array<string, array<string, mixed>> $rows
     * @return array<string, array<string, mixed>>
     */
    private function withSpend(array $rows, string $from, string $to): array
    {
        $spend = $this->spend->byCampaign($from, $to);

        // The report's keys are utm_campaign values; spend arrives under the
        // same value flattened. Match on the flattened form both ways.
        $byFlat = [];
        foreach ($rows as $key => $row) {
            $byFlat[MetaAdSpend::normalise($key)] = $key;
        }

        foreach ($spend as $flat => $s) {
            $key = $byFlat[$flat] ?? null;

            if ($key === null) {
                // Spent, sold nothing — or sold something the tags never
                // connected to it.
                $key = $s['names'][0] ?? $flat;
                $rows[$key] ??= self::blank($key, null, null);
                $rows[$key]['spendOnly'] = true;
            }

            $rows[$key]['spendTaka'] = $s['spendTaka'];
            $rows[$key]['spendDays'] = $s['days'];
            $rows[$key]['spendNames'] = $s['names'];
            $rows[$key]['spendManual'] = $s['manual'];
        }

        foreach ($rows as $key => $row) {
            $spent = (int) $row['spendTaka'];

            $rows[$key]['costPerOrder'] = $row['orders'] > 0 && $spent > 0
                ? (int) round($spent / $row['orders'])
                : null;
            $rows[$key]['costPerDelivered'] = $row['delivered'] > 0 && $spent > 0
                ? (int) round($spent / $row['delivered'])
                : null;
            $rows[$key]['roas'] = $spent > 0 ? round($row['revenueTaka'] / $spent, 2) : null;
            $rows[$key]['roasDelivered'] = $spent > 0 ? round($row['deliveredTaka'] / $spent, 2) : null;
        }

        return $rows;
    }

    /** @return array<string, mixed> */
    private static function blank(string $key, ?string $source, ?string $medium): array
    {
        return [
            'campaign'      => $key,
            'source'        => $source,
            'medium'        => $medium,
            'orders'        => 0,
            'cancelled'     => 0,
            'returned'      => 0,
            'delivered'     => 0,
            'revenueTaka'   => 0,
            'deliveredTaka' => 0,
            'spendTaka'     => 0,
            'spendDays'     => 0,
            'spendNames'    => [],
            'spendManual'   => false,
            'spendOnly'     => false,
            'costPerOrder'  => null,
            'costPerDelivered' => null,
            'roas'          => null,
            'roasDelivered' => null,
            'lastOrderAt'   => null,
        ];
    }
}
