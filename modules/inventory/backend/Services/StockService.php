<?php

declare(strict_types=1);

namespace Modules\Inventory\Services;

use Illuminate\Support\Facades\DB;
use Modules\Inventory\Models\StockLevel;
use Modules\Inventory\Models\StockMovement;
use Modules\Inventory\Models\Warehouse;
use RuntimeException;

/**
 * Every change to stock goes through here.
 *
 * ONE WRITE PATH, ON PURPOSE
 * --------------------------
 * Nothing else in the codebase may touch `stock_levels`. If a controller could
 * decrement a quantity directly, the ledger would stop being able to explain
 * the balance — and an inventory system whose ledger does not reconcile is
 * worse than none, because people trust it.
 *
 * So: a movement row and the running total are written in the same transaction,
 * always, and the running total is derivable from the ledger at any time.
 */
final class StockService
{
    /** Reasons that describe stock physically arriving. */
    private const INBOUND = ['receipt', 'return', 'transfer_in'];

    /**
     * Record a movement and update the running total.
     *
     * @param int $qtyDelta signed: +12 received, -3 sold
     * @throws RuntimeException on an incoherent movement
     */
    public function move(
        int $productId,
        int $warehouseId,
        int $qtyDelta,
        string $reason,
        ?int $unitCostPoisha = null,
        ?string $sourceType = null,
        ?int $sourceId = null,
        ?string $note = null,
        ?int $actorId = null,
        ?string $actorName = null,
    ): StockMovement {
        if ($qtyDelta === 0) {
            throw new RuntimeException('A stock movement of zero records nothing.');
        }

        // A receipt that reduces stock, or a sale that increases it, is almost
        // always a sign flipped somewhere upstream. Catching it here keeps the
        // reason totals meaningful — shrinkage reports are only worth reading
        // if "damage" really means damage.
        $inbound = in_array($reason, self::INBOUND, true);
        if ($inbound && $qtyDelta < 0) {
            throw new RuntimeException("A '{$reason}' movement cannot be negative.");
        }
        if (! $inbound && $reason !== 'count' && $qtyDelta > 0) {
            throw new RuntimeException("A '{$reason}' movement cannot be positive.");
        }

        return DB::transaction(function () use (
            $productId, $warehouseId, $qtyDelta, $reason, $unitCostPoisha,
            $sourceType, $sourceId, $note, $actorId, $actorName
        ): StockMovement {
            // Lock the level row before reading it. Two sales of the last unit
            // arriving together must not both read "1 available".
            $level = StockLevel::query()
                ->where('product_id', $productId)
                ->where('warehouse_id', $warehouseId)
                ->lockForUpdate()
                ->first();

            if ($level === null) {
                $level = StockLevel::create([
                    'product_id'   => $productId,
                    'warehouse_id' => $warehouseId,
                    'qty_on_hand'  => 0,
                ]);
            }

            $movement = StockMovement::create([
                'product_id'       => $productId,
                'warehouse_id'     => $warehouseId,
                'qty_delta'        => $qtyDelta,
                'reason'           => $reason,
                'unit_cost_poisha' => $reason === 'receipt' ? $unitCostPoisha : null,
                'source_type'      => $sourceType,
                'source_id'        => $sourceId,
                'note'             => $note,
                'actor_admin_id'   => $actorId,
                'actor_name'       => $actorName,
            ]);

            $level->increment('qty_on_hand', $qtyDelta);

            return $movement;
        });
    }

    /**
     * Promise stock to an order without moving it yet.
     *
     * Reserving rather than decrementing is what stops the same last jar being
     * sold twice between an order being placed and the parcel leaving. The
     * stock is still physically here, so on_hand must not change — only what is
     * available to promise to somebody else.
     *
     * @throws RuntimeException when there is not enough left to promise
     */
    public function reserve(int $productId, int $warehouseId, int $qty): void
    {
        DB::transaction(function () use ($productId, $warehouseId, $qty): void {
            $level = StockLevel::query()
                ->where('product_id', $productId)
                ->where('warehouse_id', $warehouseId)
                ->lockForUpdate()
                ->first();

            $available = $level ? $level->qty_on_hand - $level->qty_reserved : 0;

            if ($available < $qty) {
                throw new RuntimeException("Only {$available} available to reserve.");
            }

            $level->increment('qty_reserved', $qty);
        });
    }

    /** Give back a reservation — an order cancelled before it shipped. */
    public function release(int $productId, int $warehouseId, int $qty): void
    {
        DB::transaction(function () use ($productId, $warehouseId, $qty): void {
            $level = StockLevel::query()
                ->where('product_id', $productId)
                ->where('warehouse_id', $warehouseId)
                ->lockForUpdate()
                ->first();

            if ($level === null) {
                return;
            }

            // Never below zero: releasing more than was reserved would leave a
            // phantom surplus that lets stock be oversold later.
            $level->decrement('qty_reserved', min($qty, $level->qty_reserved));
        });
    }

    /**
     * Ship reserved stock: the reservation becomes a real outward movement.
     * One call so the two can never drift apart.
     */
    public function shipReserved(
        int $productId,
        int $warehouseId,
        int $qty,
        ?int $orderId = null,
        ?int $actorId = null,
        ?string $actorName = null,
    ): void {
        DB::transaction(function () use ($productId, $warehouseId, $qty, $orderId, $actorId, $actorName): void {
            $this->release($productId, $warehouseId, $qty);
            $this->move(
                productId:   $productId,
                warehouseId: $warehouseId,
                qtyDelta:    -abs($qty),
                reason:      'sale',
                sourceType:  $orderId ? 'order' : null,
                sourceId:    $orderId,
                actorId:     $actorId,
                actorName:   $actorName,
            );
        });
    }

    /**
     * Set an absolute counted quantity after a stocktake.
     *
     * Recorded as the DIFFERENCE with reason `count`, not as an overwrite. "The
     * shelf says 38, the system said 41" is the useful fact; a silent
     * correction to 38 destroys it, and repeated small corrections in the same
     * direction are how theft is spotted.
     */
    public function recount(
        int $productId,
        int $warehouseId,
        int $countedQty,
        ?string $note = null,
        ?int $actorId = null,
        ?string $actorName = null,
    ): ?StockMovement {
        $level = StockLevel::query()
            ->where('product_id', $productId)
            ->where('warehouse_id', $warehouseId)
            ->first();

        $delta = $countedQty - ($level->qty_on_hand ?? 0);

        if ($delta === 0) {
            // A count that agrees is not a movement. Recording it as one would
            // fill the ledger with zero rows and bury the real corrections.
            return null;
        }

        return $this->move(
            productId:   $productId,
            warehouseId: $warehouseId,
            qtyDelta:    $delta,
            reason:      'count',
            note:        $note ?? 'Stocktake correction',
            actorId:     $actorId,
            actorName:   $actorName,
        );
    }

    /**
     * Weighted average cost per unit from actual receipts.
     *
     * Returns null when no receipt has ever carried a cost — which is the state
     * today (context.md 8b/B5). Null is the honest answer, and callers must
     * report "cost unknown" rather than substituting the selling price and
     * quietly reporting revenue as profit.
     */
    public function averageCostPoisha(int $productId): ?int
    {
        $row = DB::table('stock_movements')
            ->selectRaw('SUM(qty_delta * unit_cost_poisha) as value, SUM(qty_delta) as qty')
            ->where('product_id', $productId)
            ->where('reason', 'receipt')
            ->whereNotNull('unit_cost_poisha')
            ->first();

        if (! $row || ! $row->qty) {
            return null;
        }

        return (int) round($row->value / $row->qty);
    }

    /** The warehouse online orders ship from. */
    public function defaultWarehouse(): ?Warehouse
    {
        return Warehouse::query()->where('is_active', true)->orderByDesc('is_default')->first();
    }
}
