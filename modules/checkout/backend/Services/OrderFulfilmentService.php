<?php

declare(strict_types=1);

namespace Modules\Checkout\Services;

use Illuminate\Support\Facades\DB;
use Modules\Checkout\Events\OrderStatusChanged;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderRefund;
use Modules\Checkout\Models\OrderStatusEvent;
use RuntimeException;

/**
 * Order fulfilment: what may change, who may change it, and what gets recorded.
 *
 * WHY THIS LIVES IN checkout AND NOT IN admin
 * -------------------------------------------
 * These are rules about orders, not rules about a screen. A courier webhook, a
 * customer cancelling from their account page, and a staff member clicking a
 * button must all obey the same ones — so they live with the orders, and the
 * admin panel is merely one caller. Deleting modules/admin must not make it
 * possible to move an order from delivered back to placed.
 *
 * THE TRANSITION MAP IS A WHITELIST
 * ---------------------------------
 * Not "reject a few silly moves" but "permit exactly these". An order that has
 * been delivered cannot go back to packed; a cancelled order is terminal. With
 * a free-form status field, one mis-wired dropdown silently rewrites history —
 * and the status of an order is what the customer is told on the tracking page.
 */
final class OrderFulfilmentService
{
    /**
     * from => [permitted next states].
     *
     * `cancelled`, `returned` and `spam` are terminal and appear as keys with
     * empty arrays rather than being left out, so that "is this a known status
     * with nowhere to go" and "is this an unknown status" stay different
     * questions.
     */
    public const TRANSITIONS = [
        // `spam` only from `placed`, and deliberately nowhere else. Junk is
        // spotted on the confirmation call; an order somebody already spoke to
        // a human about and confirmed was real, and if it later goes wrong that
        // is a cancellation with a reason, not a fake order.
        'placed'    => ['confirmed', 'cancelled', 'spam'],
        'confirmed' => ['packed', 'cancelled'],
        // Sealed and labelled is not the same as gone. This is the queue by the
        // door — see the ready_for_courier note in the 2026_08_13 migration.
        //
        // `shipped` is reachable straight from `packed` on purpose. The new
        // stage is a queue, not a toll gate: a courier's pick-up scan can arrive
        // before anyone has clicked "Ready for courier", and a rider standing at
        // the counter is not a reason to make staff click twice. Without this
        // the scan would find no legal move and the order would sit at `packed`
        // while the parcel was demonstrably gone.
        'packed'    => ['ready_for_courier', 'shipped', 'cancelled'],
        'ready_for_courier' => ['shipped', 'cancelled'],
        // Once it is with a courier, cancelling is no longer a thing we can do
        // unilaterally — it comes back as a return instead.
        'shipped'   => ['delivered', 'returned'],
        'delivered' => ['returned'],
        'cancelled' => [],
        'returned'  => [],
        'spam'      => [],
    ];

    /**
     * The pipeline in the order it is actually worked, for any caller that has
     * to show stages side by side.
     *
     * Separate from TRANSITIONS because that map answers "where may this go
     * next", which says nothing about sequence — `cancelled` is reachable from
     * four stages but belongs at the end of a board, not after `placed`.
     *
     * @var array<int, string>
     */
    public const STAGE_ORDER = [
        'placed', 'confirmed', 'packed', 'ready_for_courier',
        'shipped', 'delivered', 'returned', 'cancelled', 'spam',
    ];

    /**
     * The transitions that END an order rather than advancing it.
     *
     * Cancelling a paid order implies money going back, and whoever cannot see
     * money should not be able to start that. `spam` sits here too: calling an
     * order fake removes it from every figure the business is judged on, which
     * is a management call.
     *
     * Who may do these is NOT decided here. The caller passes `$mayEnd`, and
     * the admin panel resolves it from the `orders.cancel` permission — this
     * class deliberately does not know that roles or permissions exist, for the
     * same reason it lives in checkout rather than in admin.
     */
    private const RESTRICTED_TO_MANAGEMENT = ['cancelled', 'returned', 'spam'];

    /**
     * What this actor may move this order to, right now.
     *
     * One source for both the API check and the buttons the UI draws, so the
     * panel can never offer a transition the server will refuse.
     *
     * @return array<int, string>
     */
    public function allowedTransitions(Order $order, bool $mayEnd = true): array
    {
        $next = self::TRANSITIONS[$order->status] ?? [];

        if (! $mayEnd) {
            $next = array_values(array_diff($next, self::RESTRICTED_TO_MANAGEMENT));
        }

        return $next;
    }

    /**
     * Move an order to a new status and record who did it.
     *
     * @throws RuntimeException when the move is not permitted. The caller turns
     *   this into a 422 — it is a rule violation, not a server fault.
     */
    public function transition(
        Order $order,
        string $to,
        bool $mayEnd,
        ?int $actorId,
        ?string $actorName,
        ?string $note = null,
        string $actorType = 'staff',
    ): Order {
        if (! in_array($to, $this->allowedTransitions($order, $mayEnd), true)) {
            throw new RuntimeException(
                "An order that is {$order->status} cannot be marked {$to}."
            );
        }

        $result = DB::transaction(function () use ($order, $to, $actorId, $actorName, $note, $actorType) {
            $from = $order->status;

            // Lock the row before re-reading the status. Two people clicking
            // "Mark shipped" at the same moment must produce one event, not two
            // — and without this the second write silently wins with a stale
            // `from_status`, which is the field the audit trail depends on.
            $fresh = Order::query()->whereKey($order->getKey())->lockForUpdate()->first();

            if ($fresh->status !== $from) {
                throw new RuntimeException(
                    "This order was changed to {$fresh->status} by someone else. Reload and try again."
                );
            }

            $fresh->update(['status' => $to]);

            OrderStatusEvent::create([
                'order_id'       => $fresh->id,
                'from_status'    => $from,
                'to_status'      => $to,
                'actor_admin_id' => $actorId,
                'actor_name'     => $actorName,
                'actor_type'     => $actorType,
                'note'           => $note,
            ]);

            return $fresh;
        });

        // After the commit, never inside it: a listener talking to an SMS
        // gateway must not hold the order row locked for an HTTP call, and
        // must never announce a status a rollback then takes back.
        event(new OrderStatusChanged($result, $order->status, $to));

        return $result;
    }

    /** Total already refunded against an order, in poisha. */
    public function refundedPoisha(Order $order): int
    {
        return (int) OrderRefund::query()->where('order_id', $order->id)->sum('amount_poisha');
    }

    /** What is still refundable, in poisha. */
    public function refundablePoisha(Order $order): int
    {
        return max(0, $order->total_poisha - $this->refundedPoisha($order));
    }

    /**
     * Record a refund.
     *
     * The amount is validated against what is actually left, inside the same
     * transaction that writes it. Checking first and writing after leaves a gap
     * two concurrent refunds can both pass through, and the result is more money
     * going out than ever came in.
     *
     * @throws RuntimeException on any invariant breach
     */
    public function refund(
        Order $order,
        int $amountPoisha,
        string $method,
        string $reason,
        int $adminId,
        string $adminName,
        ?string $reference = null,
    ): OrderRefund {
        if ($amountPoisha <= 0) {
            throw new RuntimeException('A refund must be for more than zero.');
        }

        if ($order->payment_status !== 'paid') {
            throw new RuntimeException('This order has not been paid, so there is nothing to refund.');
        }

        return DB::transaction(function () use ($order, $amountPoisha, $method, $reason, $adminId, $adminName, $reference) {
            $locked = Order::query()->whereKey($order->getKey())->lockForUpdate()->first();

            $remaining = $this->refundablePoisha($locked);
            if ($amountPoisha > $remaining) {
                throw new RuntimeException(
                    'That is more than the ৳ ' . number_format($remaining / 100, 2) . ' still refundable on this order.'
                );
            }

            $refund = OrderRefund::create([
                'order_id'               => $locked->id,
                'amount_poisha'          => $amountPoisha,
                'method'                 => $method,
                'reference'              => $reference,
                'reason'                 => $reason,
                'authorised_by_admin_id' => $adminId,
                'authorised_by_name'     => $adminName,
            ]);

            // Only a refund of everything flips the payment status. A partial
            // refund leaves the order paid, because it is: money was taken and
            // most of it was kept.
            if ($amountPoisha === $remaining) {
                $locked->update(['payment_status' => 'refunded']);
            }

            return $refund;
        });
    }
}
