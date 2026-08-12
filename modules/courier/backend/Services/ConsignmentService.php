<?php

declare(strict_types=1);

namespace Modules\Courier\Services;

use Illuminate\Support\Facades\DB;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Services\OrderFulfilmentService;
use Modules\Courier\Models\Consignment;
use Modules\Courier\Models\ConsignmentEvent;
use Modules\Courier\Models\Courier;
use RuntimeException;
use Throwable;

/**
 * Assigning parcels to couriers, and keeping the order in step.
 *
 * THE ORDER STATUS IS NOT WRITTEN DIRECTLY FROM HERE
 * --------------------------------------------------
 * When a courier reports "delivered", this service does not update
 * `orders.status`. It calls OrderFulfilmentService::transition() like any other
 * caller, so the same whitelist applies and the same audit row is written —
 * with `actor_type = 'system'` so the trail says a courier caused it, not a
 * person. A courier reporting "delivered" on an order that was cancelled last
 * week must be refused by the same rule that refuses a staff member doing it.
 */
final class ConsignmentService
{
    public function __construct(
        private readonly DriverRegistry $drivers,
        private readonly OrderFulfilmentService $fulfilment,
    ) {
    }

    /**
     * Courier status → the order status it implies.
     *
     * Only three of the eight map to anything. `in_transit` and `picked_up`
     * both mean the order is shipped, and a failed attempt changes nothing
     * about the order — the parcel is still out there and the courier will try
     * again. Mapping every courier status onto an order status would make the
     * customer's tracking page flap.
     */
    private const ORDER_STATUS_FOR = [
        'picked_up'  => 'shipped',
        'in_transit' => 'shipped',
        'delivered'  => 'delivered',
        'returned'   => 'returned',
    ];

    /**
     * Hand an order to a courier.
     *
     * @throws RuntimeException when the courier is unusable or the order is not
     *   in a state where handing it over makes sense
     */
    public function assign(
        Order $order,
        Courier $courier,
        int $adminId,
        string $adminName,
        ?string $trackingNumber = null,
        ?int $costPoisha = null,
        ?string $note = null,
    ): Consignment {
        if (! $courier->is_active) {
            throw new RuntimeException("{$courier->name} is switched off.");
        }

        $driver = $this->drivers->for($courier);

        if (! $driver->isReady($courier)) {
            throw new RuntimeException(
                "{$courier->name} has no credentials configured, so it cannot be booked automatically. " .
                'Use a manual courier and record the tracking number by hand.'
            );
        }

        // A parcel that has not been packed cannot be handed to anyone, and an
        // order that is finished should not gain a new consignment.
        // `ready_for_courier` is the stage this whole screen exists to drain,
        // so it is the expected one here rather than an afterthought.
        //
        // `confirmed` used to be permitted and no longer is, which makes the
        // code match the sentence above it: a confirmed order has not been
        // packed, so there is no parcel to hand over. It also keeps the
        // handover -> shipped move below legal from every state that reaches
        // here, instead of silently doing nothing from one of them.
        if (! in_array($order->status, ['packed', 'ready_for_courier'], true)) {
            throw new RuntimeException(
                "An order that is {$order->status} cannot be handed to a courier."
            );
        }

        // One open consignment at a time. A second handover while the first is
        // still live means two riders looking for the same parcel.
        $open = Consignment::query()
            ->where('order_id', $order->id)
            ->whereNotIn('status', ['delivered', 'returned', 'cancelled'])
            ->exists();

        if ($open) {
            throw new RuntimeException('This order already has a consignment in progress.');
        }

        $consignment = DB::transaction(function () use ($order, $courier, $driver, $adminId, $adminName, $trackingNumber, $costPoisha, $note) {
            $consignment = Consignment::create([
                'order_id'             => $order->id,
                'courier_id'           => $courier->id,
                'tracking_number'      => $trackingNumber,
                'status'               => 'draft',
                'cost_poisha'          => $costPoisha,
                // Cash on delivery is the courier's to collect and ours to
                // chase. Recorded at handover so it is a receivable from the
                // moment the parcel leaves, not from when someone remembers.
                'cod_amount_poisha'    => $order->payment_method === 'cod' && $order->payment_status !== 'paid'
                    ? $order->total_poisha
                    : 0,
                'assigned_by_admin_id' => $adminId,
                'assigned_by_name'     => $adminName,
                'handed_over_at'       => now(),
                'note'                 => $note,
            ]);

            try {
                $result = $driver->book($consignment);
            } catch (Throwable $e) {
                // The booking failed, so the row must not survive claiming the
                // parcel was handed over. Rethrown as a rule violation for the
                // caller to show, not a 500.
                throw new RuntimeException("{$courier->name} refused the booking: {$e->getMessage()}");
            }

            $consignment->update([
                'tracking_number' => $result['trackingNumber'] ?? $consignment->tracking_number,
                'consignment_ref' => $result['consignmentRef'] ?? null,
                'cost_poisha'     => $result['costPoisha'] ?? $consignment->cost_poisha,
                'status'          => 'booked',
            ]);

            $this->recordEvent($consignment, 'booked', "Handed to {$courier->name}", 'staff', $adminName);

            return $consignment->fresh(['courier', 'events']);
        });

        // THE HANDOVER MOVES THE ORDER. The parcel has left the building, so an
        // order still reading "Ready for courier" is a screen lying about where
        // its parcel is — and the two screens then disagree, which is how staff
        // stop trusting either. This is the moment "with courier" becomes true.
        //
        // After the commit, never inside it: transition() fires
        // OrderStatusChanged, and the "your order is on the way" SMS must not
        // go out ahead of a consignment row that a rollback could still take
        // back. Same rule the service states about its own event.
        //
        // Caveat for the first real API adapter: with a carrier that BOOKS in
        // advance and collects later, booking is not handover, and the honest
        // moment becomes its pick-up scan. Every driver today is manual, where
        // assign() happens with the parcel physically in someone's hands.
        try {
            $this->fulfilment->transition(
                order:     $order,
                to:        'shipped',
                // 'owner' so a warehouse account handing over a parcel is not
                // stopped by a restriction meant for cancellations.
                role:      'owner',
                actorId:   $adminId,
                actorName: $adminName,
                note:      "Handed to {$courier->name}",
            );
        } catch (RuntimeException) {
            // The order could not legally move — it was changed by someone else
            // between the guard above and here. The handover itself is real and
            // recorded; refusing it now would throw away a parcel that has
            // already gone.
        }

        return $consignment;
    }

    /**
     * Record a status change on a consignment, and move the order if it implies
     * one.
     *
     * `source` distinguishes a courier's scan from a staff member typing it in.
     * On the manual driver everything is staff-entered, and the trail should
     * never imply a carrier confirmed something it never saw.
     */
    public function recordStatus(
        Consignment $consignment,
        string $status,
        string $source = 'staff',
        ?string $actorName = null,
        ?string $description = null,
        ?string $location = null,
        ?string $externalId = null,
    ): Consignment {
        return DB::transaction(function () use ($consignment, $status, $source, $actorName, $description, $location, $externalId) {
            $consignment->update(['status' => $status]);
            $this->recordEvent($consignment, $status, $description, $source, $actorName, $location, $externalId);

            $implied = self::ORDER_STATUS_FOR[$status] ?? null;
            if ($implied === null) {
                return $consignment->fresh(['courier', 'events']);
            }

            $order = Order::find($consignment->order_id);
            if ($order === null || $order->status === $implied) {
                return $consignment->fresh(['courier', 'events']);
            }

            try {
                $this->fulfilment->transition(
                    order:     $order,
                    to:        $implied,
                    // 'owner' so the courier's report is not blocked by the
                    // warehouse restriction — a returned parcel is a fact, not
                    // a decision someone is making.
                    role:      'owner',
                    actorId:   null,
                    actorName: $consignment->courier?->name,
                    note:      "Reported by courier: {$status}",
                    actorType: 'system',
                );
            } catch (RuntimeException) {
                // The order cannot legally go there — a delivery scan arriving
                // after the order was cancelled, for instance. The consignment
                // event is still recorded, because it happened; the order keeps
                // its own truth. Swallowing this is deliberate: a courier's
                // late webhook must not fail the request or rewrite history.
            }

            return $consignment->fresh(['courier', 'events']);
        });
    }

    /** Poll a courier for new scans. A no-op for manual consignments. */
    public function sync(Consignment $consignment): int
    {
        if ($consignment->isClosed()) {
            return 0;
        }

        $driver = $this->drivers->for($consignment->courier);
        $added = 0;

        foreach ($driver->track($consignment) as $event) {
            // firstOrCreate on the unique (consignment_id, external_id) pair:
            // couriers resend, and a tracking list showing "Picked up" four
            // times reads as broken even when nothing is wrong.
            $created = ConsignmentEvent::firstOrCreate(
                [
                    'consignment_id' => $consignment->id,
                    'external_id'    => $event['externalId'] ?? null,
                ],
                [
                    'status'      => $event['status'],
                    'description' => $event['description'] ?? null,
                    'location'    => $event['location'] ?? null,
                    'source'      => 'courier',
                    'occurred_at' => $event['occurredAt'],
                ],
            );

            if ($created->wasRecentlyCreated) {
                $added++;
                $this->recordStatus(
                    $consignment,
                    $event['status'],
                    'courier',
                    $consignment->courier?->name,
                    $event['description'] ?? null,
                    $event['location'] ?? null,
                    $event['externalId'] ?? null,
                );
            }
        }

        return $added;
    }

    private function recordEvent(
        Consignment $consignment,
        string $status,
        ?string $description,
        string $source,
        ?string $actorName,
        ?string $location = null,
        ?string $externalId = null,
    ): void {
        ConsignmentEvent::firstOrCreate(
            ['consignment_id' => $consignment->id, 'external_id' => $externalId],
            [
                'status'      => $status,
                'description' => $description,
                'location'    => $location,
                'source'      => $source,
                'actor_name'  => $actorName,
                'occurred_at' => now(),
            ],
        );
    }
}
