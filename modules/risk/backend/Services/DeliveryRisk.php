<?php

declare(strict_types=1);

namespace Modules\Risk\Services;

use Illuminate\Support\Collection;
use Modules\Checkout\Models\Order;

/**
 * Whether this phone number's parcels come back.
 *
 * THE PROBLEM THIS EXISTS FOR
 * ---------------------------
 * Cash on delivery means the shop pays to send a parcel before anyone has paid
 * for it. A refused delivery costs the courier fee both ways and the packing
 * in between, and the customer loses nothing - so a number that refuses once
 * refuses again. Every established shop in Bangladesh keeps this list; most
 * keep it in somebody's head, or a notebook, and it leaves when they do.
 *
 * The shop already has the data: `orders.status` records delivered, returned,
 * cancelled and spam against a phone number that the checkout normalises to
 * one form. This reads it back before the next parcel goes out.
 *
 * ITS OWN HISTORY, NOT A SHARED BLACKLIST
 * ---------------------------------------
 * Nothing here calls a third-party fraud service, and nothing is shared with
 * one. This is what happened between this shop and this customer, which is the
 * only evidence the shop can stand behind, and it stays inside the shop.
 *
 * IT ADVISES, IT DOES NOT REFUSE
 * ------------------------------
 * No order is blocked, no customer is banned, and the storefront never sees
 * any of this. A band is a sentence for the person deciding whether to send a
 * parcel today: call first, or take the delivery charge in advance. Two
 * refusals are a pattern worth a phone call, not a verdict on a person - and
 * the reason is always printed beside the band so a human can disagree with it.
 */
final class DeliveryRisk
{
    /**
     * Statuses that decide the question. Anything else is still in flight and
     * says nothing about anybody yet.
     */
    private const DELIVERED = 'delivered';
    private const FAILED = ['returned', 'cancelled', 'spam'];

    /** Three orders in flight and nothing delivered yet is its own pattern. */
    private const PENDING_WATCH = 3;

    /**
     * One phone's record.
     *
     * `$exclude` is the order being looked at, kept out of its own verdict: an
     * order judging itself would report every first-time customer as having a
     * pending order and nothing delivered.
     *
     * @return array<string, mixed>
     */
    public function forPhone(string $phone, ?string $exclude = null): array
    {
        $normal = self::normalise($phone);

        if ($normal === '') {
            return $this->verdict('new', 0, 0, 0, 'That does not look like a phone number.', []);
        }

        $orders = Order::query()
            ->where('customer_phone', $normal)
            ->when($exclude !== null, fn ($q) => $q->where('order_number', '!=', $exclude))
            ->orderByDesc('created_at')
            ->limit(200)
            ->get(['id', 'order_number', 'status', 'total_poisha', 'district_name',
                   'payment_method', 'payment_status', 'created_at']);

        return $this->judge($orders);
    }

    /**
     * The band for a set of phones at once, for a list screen.
     *
     * One query for the whole page rather than one per row: the orders list
     * shows fifty rows, and fifty round trips to answer "is this one worth a
     * call" would be felt on every page of it.
     *
     * @param  list<string> $phones
     * @return array<string, array<string, mixed>>
     */
    public function forPhones(array $phones): array
    {
        $normal = array_values(array_unique(array_filter(array_map(
            static fn (string $p): string => self::normalise($p),
            $phones,
        ))));

        if ($normal === []) {
            return [];
        }

        $rows = Order::query()
            ->whereIn('customer_phone', $normal)
            ->get(['customer_phone', 'status', 'order_number', 'total_poisha', 'district_name',
                   'payment_method', 'payment_status', 'created_at'])
            ->groupBy('customer_phone');

        $out = [];
        foreach ($rows as $phone => $orders) {
            $out[(string) $phone] = $this->judge($orders);
        }

        return $out;
    }

    /**
     * The numbers worth knowing about before the next order from them.
     *
     * Ranked by parcels LOST, not by rate: one customer who refused four
     * parcels costs four times what one who refused their only order did, and
     * a rate alone puts the second at the top.
     *
     * @return array<string, mixed>
     */
    public function watchlist(int $days, int $limit = 50): array
    {
        $orders = Order::query()
            ->where('created_at', '>=', now()->subDays($days))
            ->get(['customer_phone', 'customer_name', 'status', 'total_poisha',
                   'district_name', 'payment_method', 'created_at']);

        $byPhone = [];

        foreach ($orders as $o) {
            $phone = (string) $o->customer_phone;
            if ($phone === '') {
                continue;
            }

            $byPhone[$phone] ??= [
                'phone'     => $phone,
                'name'      => $o->customer_name,
                'orders'    => 0,
                'delivered' => 0,
                'failed'    => 0,
                'lostTaka'  => 0,
                'districts' => [],
                'lastAt'    => null,
            ];

            $byPhone[$phone]['orders']++;
            $byPhone[$phone]['districts'][(string) $o->district_name] = true;

            $at = $o->created_at?->toIso8601String();
            if ($at !== null && ($byPhone[$phone]['lastAt'] === null || $at > $byPhone[$phone]['lastAt'])) {
                $byPhone[$phone]['lastAt'] = $at;
            }

            if ($o->status === self::DELIVERED) {
                $byPhone[$phone]['delivered']++;
            } elseif (in_array($o->status, self::FAILED, true)) {
                $byPhone[$phone]['failed']++;
                // What the refusals cost, at the order's own value: the
                // courier charge is not recorded per parcel, so this is the
                // value that did not become revenue rather than a bill.
                $byPhone[$phone]['lostTaka'] += intdiv((int) $o->total_poisha, 100);
            }
        }

        $rows = [];
        foreach ($byPhone as $phone => $row) {
            if ($row['failed'] < 1) {
                continue;
            }

            $decided = $row['delivered'] + $row['failed'];
            $rows[] = [
                'phone'      => $phone,
                'name'       => $row['name'],
                'orders'     => $row['orders'],
                'delivered'  => $row['delivered'],
                'failed'     => $row['failed'],
                'failedPct'  => $decided > 0 ? round($row['failed'] / $decided * 100, 1) : null,
                'lostTaka'   => $row['lostTaka'],
                'districts'  => array_values(array_filter(array_keys($row['districts']))),
                'lastAt'     => $row['lastAt'],
                'band'       => $this->band($row['delivered'], $row['failed'], 0, 0),
            ];
        }

        usort($rows, fn (array $a, array $b): int => [$b['failed'], $b['lostTaka']] <=> [$a['failed'], $a['lostTaka']]);

        return [
            'days'  => $days,
            'rows'  => array_slice($rows, 0, $limit),
            'total' => count($rows),
        ];
    }

    /**
     * How the shop as a whole is doing at getting parcels accepted, and where
     * it is worst.
     *
     * By district because that is a decision a merchant can act on - a
     * district that refuses a third of its parcels is one where the advance
     * delivery charge is worth asking for, or the courier is worth changing.
     *
     * @return array<string, mixed>
     */
    public function shopWide(int $days): array
    {
        $orders = Order::query()
            ->where('created_at', '>=', now()->subDays($days))
            ->get(['status', 'district_name', 'district_key', 'payment_method', 'total_poisha']);

        $totals = ['orders' => 0, 'delivered' => 0, 'failed' => 0, 'pending' => 0, 'lostTaka' => 0, 'deliveredTaka' => 0];
        $districts = [];
        $payments = [];

        foreach ($orders as $o) {
            $taka = intdiv((int) $o->total_poisha, 100);
            $district = (string) ($o->district_name ?: 'Unknown');
            $payment = (string) ($o->payment_method ?: 'unknown');

            $districts[$district] ??= ['district' => $district, 'orders' => 0, 'delivered' => 0, 'failed' => 0, 'lostTaka' => 0];
            $payments[$payment] ??= ['method' => $payment, 'orders' => 0, 'delivered' => 0, 'failed' => 0];

            $totals['orders']++;
            $districts[$district]['orders']++;
            $payments[$payment]['orders']++;

            if ($o->status === self::DELIVERED) {
                $totals['delivered']++;
                $totals['deliveredTaka'] += $taka;
                $districts[$district]['delivered']++;
                $payments[$payment]['delivered']++;
            } elseif (in_array($o->status, self::FAILED, true)) {
                $totals['failed']++;
                $totals['lostTaka'] += $taka;
                $districts[$district]['failed']++;
                $districts[$district]['lostTaka'] += $taka;
                $payments[$payment]['failed']++;
            } else {
                $totals['pending']++;
            }
        }

        $decided = $totals['delivered'] + $totals['failed'];

        foreach ($districts as $key => $d) {
            $dd = $d['delivered'] + $d['failed'];
            $districts[$key]['failedPct'] = $dd > 0 ? round($d['failed'] / $dd * 100, 1) : null;
        }
        foreach ($payments as $key => $p) {
            $pd = $p['delivered'] + $p['failed'];
            $payments[$key]['failedPct'] = $pd > 0 ? round($p['failed'] / $pd * 100, 1) : null;
        }

        // Worst first, but only where enough parcels have been decided for the
        // rate to mean anything - one refusal out of one order is not a bad
        // district, it is one refusal.
        $ranked = array_values(array_filter($districts, fn (array $d): bool => $d['delivered'] + $d['failed'] >= 3));
        usort($ranked, fn (array $a, array $b): int => ($b['failedPct'] ?? -1) <=> ($a['failedPct'] ?? -1));

        return [
            'days'      => $days,
            'orders'    => $totals['orders'],
            'delivered' => $totals['delivered'],
            'failed'    => $totals['failed'],
            'pending'   => $totals['pending'],
            'decided'   => $decided,
            'failedPct' => $decided > 0 ? round($totals['failed'] / $decided * 100, 1) : null,
            'lostTaka'  => $totals['lostTaka'],
            'deliveredTaka' => $totals['deliveredTaka'],
            'districts' => array_slice($ranked, 0, 15),
            'payments'  => array_values($payments),
        ];
    }

    /**
     * The checkout's own normalisation, applied again here so a number typed
     * with a +88, a space or a dash finds the same orders it was saved under.
     */
    public static function normalise(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        // 8801712345678 -> 01712345678
        if (str_starts_with($digits, '880')) {
            $digits = '0' . substr($digits, 3);
        }
        // 1712345678 -> 01712345678
        if (strlen($digits) === 10 && str_starts_with($digits, '1')) {
            $digits = '0' . $digits;
        }

        return preg_match('/^01[3-9]\d{8}$/', $digits) === 1 ? $digits : '';
    }

    /* ---- the judgement ---------------------------------------------------- */

    /** @param Collection<int, Order> $orders */
    private function judge(Collection $orders): array
    {
        $delivered = 0;
        $failed = 0;
        $pending = 0;
        $spam = 0;
        $lost = 0;
        $spent = 0;

        foreach ($orders as $o) {
            $taka = intdiv((int) $o->total_poisha, 100);

            if ($o->status === self::DELIVERED) {
                $delivered++;
                $spent += $taka;
            } elseif (in_array($o->status, self::FAILED, true)) {
                $failed++;
                $lost += $taka;
                if ($o->status === 'spam') {
                    $spam++;
                }
            } else {
                $pending++;
            }
        }

        $band = $this->band($delivered, $failed, $pending, $spam);

        // array_merge, not +: the union operator keeps the LEFT key, which
        // would hold every one of these at the zero the shape is declared with.
        return array_merge(
            $this->verdict(
                $band,
                $delivered,
                $failed,
                $pending,
                $this->reason($band, $delivered, $failed, $pending, $spam),
                $orders->map(fn (Order $o): array => [
                    'orderNumber' => $o->order_number,
                    'status'      => $o->status,
                    'taka'        => intdiv((int) $o->total_poisha, 100),
                    'district'    => $o->district_name,
                    'payment'     => $o->payment_method,
                    'at'          => $o->created_at?->toIso8601String(),
                ])->all(),
            ),
            ['lostTaka' => $lost, 'spentTaka' => $spent, 'spam' => $spam],
        );
    }

    /**
     * The bands, in the order a person would ask the questions.
     *
     * A rate needs a denominator that means something, so only DECIDED orders
     * count: an order still with the courier is not evidence either way.
     */
    private function band(int $delivered, int $failed, int $pending, int $spam): string
    {
        $decided = $delivered + $failed;

        // A confirmed fake order is not a rate, it is a fact.
        if ($spam > 0) {
            return 'risky';
        }

        if ($decided === 0) {
            return $pending >= self::PENDING_WATCH ? 'watch' : 'new';
        }

        if ($failed === 0) {
            return 'good';
        }

        $rate = $failed / $decided;

        return match (true) {
            $rate >= 0.67 || $failed >= 3 => 'risky',
            $rate >= 0.34                 => 'watch',
            default                       => 'ok',
        };
    }

    private function reason(string $band, int $delivered, int $failed, int $pending, int $spam): string
    {
        $decided = $delivered + $failed;
        $parcels = fn (int $n): string => $n === 1 ? '1 parcel' : "{$n} parcels";

        return match ($band) {
            'new' => $pending > 0
                ? 'No completed order from this number yet, and ' . ($pending === 1 ? 'one is' : "{$pending} are") . ' already on the way.'
                : 'First order from this number. Nothing known either way.',
            'good' => $delivered === 1
                ? 'One parcel, accepted. Nothing has ever come back.'
                : "{$delivered} parcels, all accepted. Nothing has ever come back.",
            'ok' => sprintf('%s of %d did not complete — normal for cash on delivery.', $parcels($failed), $decided),
            'watch' => $decided === 0
                ? "{$pending} orders are in flight and none has been delivered yet. Worth one call before another goes out."
                : sprintf('%s of %d came back or were cancelled. Worth a confirmation call before dispatch.', $parcels($failed), $decided),
            'risky' => $spam > 0
                ? 'An order from this number has been marked fake. Take payment before dispatch.'
                : sprintf('%s of %d came back. Ask for the delivery charge in advance, or take payment before dispatch.', $parcels($failed), $decided),
            default => '',
        };
    }

    /** @param list<array<string, mixed>> $orders */
    private function verdict(string $band, int $delivered, int $failed, int $pending, string $reason, array $orders): array
    {
        return [
            'band'      => $band,
            'delivered' => $delivered,
            'failed'    => $failed,
            'pending'   => $pending,
            'decided'   => $delivered + $failed,
            'failedPct' => ($delivered + $failed) > 0 ? round($failed / ($delivered + $failed) * 100, 1) : null,
            'reason'    => $reason,
            'orders'    => $orders,
            // Declared here so every caller gets the same shape, including the
            // early return for a number that is not a number.
            'lostTaka'  => 0,
            'spentTaka' => 0,
            'spam'      => 0,
        ];
    }
}
