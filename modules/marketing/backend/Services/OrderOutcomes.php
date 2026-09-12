<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use Illuminate\Support\Collection;
use Modules\Checkout\Models\Order;
use Modules\Marketing\Models\TrackingEvent;

/**
 * What became of the orders the pixel saw.
 *
 * WHY THIS IS THE REPORT THAT MATTERS IN BANGLADESH
 * -------------------------------------------------
 * A cash-on-delivery order is a promise, not a sale. Meta counts a Purchase
 * the moment "Place order" is pressed; the shop is paid only when the rider
 * hands the parcel over. Between the two sit the phone call that is never
 * answered, the parcel refused at the door and the fake order placed for
 * fun - and they are not spread evenly. One campaign can bring buyers while
 * another brings people who cancel.
 *
 * So every tracked Purchase is matched to the order it created - the checkout
 * stores the Purchase's event_id on the order as pixel_event_id, exactly so
 * the pair can be found again - and reported by what happened to it. Revenue
 * that was delivered is money; revenue that was placed is a forecast.
 *
 * IN THIS DIRECTION ONLY
 * ----------------------
 * Marketing reads orders; checkout knows nothing about marketing. Deleting
 * this module leaves every order exactly as it was.
 */
final class OrderOutcomes
{
    /** Order statuses folded into the five things a merchant asks about. */
    public const BUCKETS = ['delivered', 'in_progress', 'cancelled', 'returned', 'spam'];

    /** Enough for any real window; a cap so a pathological one cannot exhaust memory. */
    private const MAX_PURCHASES = 5000;

    public static function bucket(?string $status): string
    {
        return match ($status) {
            'delivered' => 'delivered',
            'cancelled' => 'cancelled',
            'returned'  => 'returned',
            'spam'      => 'spam',
            default     => 'in_progress',
        };
    }

    /**
     * Every tracked purchase in the slice, paired with its order when one
     * exists.
     *
     * @return Collection<int, array{purchase: TrackingEvent, order: Order|null}>
     */
    public function linked(TrackerFilter $f): Collection
    {
        $purchases = $f->events()
            ->where('event_name', 'Purchase')
            ->orderBy('id')
            ->limit(self::MAX_PURCHASES)
            ->get(['id', 'event_id', 'session_id', 'channel', 'device', 'browser', 'value_poisha', 'content_ids', 'created_at']);

        $orders = $this->byEventId($purchases->pluck('event_id')->filter()->all());

        return $purchases->map(fn (TrackingEvent $p): array => [
            'purchase' => $p,
            'order'    => $p->event_id !== null ? ($orders[$p->event_id] ?? null) : null,
        ]);
    }

    /**
     * The orders a set of Purchase event ids created, keyed by that id.
     *
     * Chunked: a whereIn with thousands of bindings is legal and slow, and a
     * shared host's MySQL is not the place to find the limit.
     *
     * @param  list<string> $eventIds
     * @return array<string, Order>
     */
    public function byEventId(array $eventIds): array
    {
        $out = [];

        foreach (array_chunk(array_values(array_unique($eventIds)), 500) as $chunk) {
            Order::query()
                ->whereIn('pixel_event_id', $chunk)
                ->get(['id', 'order_number', 'pixel_event_id', 'status', 'total_poisha',
                       'district_name', 'district_key', 'payment_method', 'created_at'])
                ->each(function (Order $o) use (&$out): void {
                    $out[(string) $o->pixel_event_id] = $o;
                });
        }

        return $out;
    }

    /**
     * Did the tracking see every order, and what happened to the ones it saw.
     *
     * "Tracked but no order" is a purchase event whose order never arrived -
     * a checkout that failed after the pixel fired, or a double tap. "Orders
     * the pixel missed" are orders with no tracked purchase: an ad blocker, a
     * beacon lost on a bad connection, or an order keyed in by staff. The
     * second number cannot be scoped to a channel or device - an order the
     * pixel never saw has neither - so it is only given for the whole shop.
     *
     * @param  Collection<int, array{purchase: TrackingEvent, order: Order|null}> $linked
     * @return array<string, mixed>
     */
    public function reconcile(TrackerFilter $f, Collection $linked): array
    {
        $matched   = $linked->filter(fn (array $l): bool => $l['order'] !== null);
        $byStatus  = array_fill_keys(self::BUCKETS, 0);
        $delivered = 0;
        $placed    = 0;

        foreach ($matched as $l) {
            $bucket = self::bucket($l['order']->status);
            $byStatus[$bucket]++;
            $placed += (int) $l['order']->total_poisha;
            if ($bucket === 'delivered') {
                $delivered += (int) $l['order']->total_poisha;
            }
        }

        $ordersInWindow = null;
        $untracked      = null;

        if (! $f->segmented()) {
            $ordersInWindow = Order::query()
                ->where('created_at', '>=', $f->start)
                ->where('created_at', '<', $f->end)
                ->count();

            $untracked = max(0, $ordersInWindow - $matched->count());
        }

        return [
            'tracked'        => $linked->count(),
            'matched'        => $matched->count(),
            'unmatched'      => $linked->count() - $matched->count(),
            'ordersInWindow' => $ordersInWindow,
            'untracked'      => $untracked,
            'coveragePct'    => $ordersInWindow ? round($matched->count() / $ordersInWindow * 100, 1) : null,
            'byStatus'       => $byStatus,
            'deliveredTaka'  => intdiv($delivered, 100),
            'placedTaka'     => intdiv($placed, 100),
        ];
    }

    /**
     * Order outcomes per channel - the "which campaign brings buyers and which
     * brings cancellations" table.
     *
     * @param  Collection<int, array{purchase: TrackingEvent, order: Order|null}> $linked
     * @return list<array<string, mixed>>
     */
    public function byChannel(Collection $linked): array
    {
        $rows = [];

        foreach ($linked as $l) {
            if ($l['order'] === null) {
                continue;
            }

            $key = $l['purchase']->channel ?? 'unknown';
            $rows[$key] ??= ['channel' => $key, 'orders' => 0, 'deliveredTaka' => 0, 'placedTaka' => 0]
                + array_fill_keys(self::BUCKETS, 0);

            $bucket = self::bucket($l['order']->status);
            $taka   = intdiv((int) $l['order']->total_poisha, 100);

            $rows[$key]['orders']++;
            $rows[$key][$bucket]++;
            $rows[$key]['placedTaka'] += $taka;
            if ($bucket === 'delivered') {
                $rows[$key]['deliveredTaka'] += $taka;
            }
        }

        usort($rows, fn (array $a, array $b): int => $b['orders'] <=> $a['orders']);

        return array_values($rows);
    }

    /**
     * Where the orders go, by district.
     *
     * The whole shop's orders when no segment is chosen - a merchant planning
     * courier coverage wants every order, tracked or not - and only the
     * pixel's matched orders when one is, because only those have a channel.
     *
     * @param  Collection<int, array{purchase: TrackingEvent, order: Order|null}> $linked
     * @return array<string, mixed>
     */
    public function geography(TrackerFilter $f, Collection $linked): array
    {
        if ($f->segmented()) {
            $orders = $linked->pluck('order')->filter()->values();
            $source = 'tracked';
        } else {
            $orders = Order::query()
                ->where('created_at', '>=', $f->start)
                ->where('created_at', '<', $f->end)
                ->limit(20000)
                ->get(['district_name', 'district_key', 'status', 'total_poisha']);
            $source = 'orders';
        }

        $districts = [];
        $inside    = 0;

        foreach ($orders as $o) {
            $key = (string) ($o->district_key ?: 'unknown');
            $districts[$key] ??= [
                'district'      => (string) ($o->district_name ?: 'Unknown'),
                'orders'        => 0,
                'placedTaka'    => 0,
                'delivered'     => 0,
                'lost'          => 0,
            ];

            $bucket = self::bucket($o->status);
            $districts[$key]['orders']++;
            $districts[$key]['placedTaka'] += intdiv((int) $o->total_poisha, 100);
            if ($bucket === 'delivered') {
                $districts[$key]['delivered']++;
            } elseif ($bucket === 'cancelled' || $bucket === 'returned') {
                $districts[$key]['lost']++;
            }

            if ($key === 'dhaka') {
                $inside++;
            }
        }

        usort($districts, fn (array $a, array $b): int => $b['orders'] <=> $a['orders']);

        return [
            'source'        => $source,
            'total'         => $orders->count(),
            'insideDhaka'   => $inside,
            'outsideDhaka'  => $orders->count() - $inside,
            'districts'     => array_slice(array_values($districts), 0, 15),
        ];
    }
}
