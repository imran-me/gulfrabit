<?php

declare(strict_types=1);

namespace Modules\Accounting\Services;

use Illuminate\Support\Facades\Schema;
use Modules\Accounting\Models\JournalEntry;
use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderRefund;

/**
 * Turning trade into bookkeeping, automatically.
 *
 * WHAT IS AND IS NOT POSTED
 * -------------------------
 * A sale is posted when the order is PAID, not when it is placed. A placed
 * order is a promise; posting it as revenue inflates the month and then needs
 * unwinding when a cash-on-delivery attempt fails. For COD, the money is
 * recognised when the courier remits it, and until then it sits in a
 * receivable — which is what "delivered" actually means financially.
 *
 * COST OF GOODS IS POSTED ONLY WHEN THE COST IS KNOWN
 * ---------------------------------------------------
 * If no receipt has ever carried a unit cost (the state today — context.md
 * §8b/B5), the sale is posted WITHOUT a cost-of-goods line and the entry is
 * flagged. Revenue is recorded correctly; gross profit is simply unavailable,
 * and the P&L says so.
 *
 * The alternative — assuming a cost of zero — would post every sale as 100%
 * margin. That is not a smaller error than leaving it out; it is a larger one,
 * because it produces a confident, wrong, flattering number that nobody
 * questions.
 */
final class OrderPostingService
{
    public function __construct(
        private readonly LedgerService $ledger,
    ) {
    }

    /**
     * Post a paid order.
     *
     * Returns null when there is nothing to do — already posted, or not paid.
     * Idempotent by the unique (source_type, source_id) index, so a retried job
     * cannot double-count a sale.
     */
    public function postSale(Order $order): ?JournalEntry
    {
        if ($order->payment_status !== 'paid') {
            return null;
        }

        if ($this->ledger->alreadyPosted('order', $order->id)) {
            return null;
        }

        $goods = $order->subtotal_poisha - $order->discount_poisha;
        $delivery = $order->delivery_charge_poisha;
        $total = $order->total_poisha;

        $lines = [
            // Where the money landed. Cash-on-delivery has not reached us yet,
            // so it is a receivable from the courier rather than cash.
            [
                'account' => $order->payment_method === 'cod' ? 'courier_receivable' : 'cash_at_bank',
                'debit'   => $total,
                'memo'    => "Order {$order->order_number}",
            ],
            ['account' => 'sales_revenue', 'credit' => $goods, 'memo' => 'Goods'],
        ];

        if ($delivery > 0) {
            // Delivery income is kept apart from goods revenue. It is the only
            // way to answer whether delivery pays for itself, and that question
            // gets asked the first time fuel prices move.
            $lines[] = ['account' => 'delivery_income', 'credit' => $delivery, 'memo' => 'Delivery charged'];
        }

        $cogs = $this->costOfGoods($order);

        if ($cogs !== null && $cogs > 0) {
            $lines[] = ['account' => 'cost_of_goods', 'debit' => $cogs, 'memo' => 'Cost of goods sold'];
            $lines[] = ['account' => 'inventory', 'credit' => $cogs, 'memo' => 'Stock released'];
        }

        $memo = "Sale {$order->order_number}"
            . ($cogs === null ? ' (cost of goods not recorded)' : '');

        return $this->ledger->post(
            memo:       $memo,
            lines:      $lines,
            entryDate:  $order->placed_at?->toDateString(),
            sourceType: 'order',
            sourceId:   $order->id,
        );
    }

    /** Post a refund: revenue comes back out, money goes back to the customer. */
    public function postRefund(OrderRefund $refund): ?JournalEntry
    {
        if ($this->ledger->alreadyPosted('refund', $refund->id)) {
            return null;
        }

        return $this->ledger->post(
            memo: "Refund on order #{$refund->order_id}: {$refund->reason}",
            lines: [
                // A contra-revenue account, not a negative sale. Gross sales
                // and refunds are both facts worth seeing, and netting them
                // hides how much is being sent back.
                ['account' => 'sales_refunds', 'debit' => $refund->amount_poisha, 'memo' => $refund->reason],
                ['account' => 'cash_at_bank', 'credit' => $refund->amount_poisha, 'memo' => $refund->method],
            ],
            sourceType: 'refund',
            sourceId:   $refund->id,
        );
    }

    /**
     * What the goods on this order cost us, or null if we do not know.
     *
     * Null when ANY line has no known cost — not "the ones we know about",
     * because a partial cost of goods understates cost and overstates profit,
     * which is the same lie as assuming zero, only harder to spot.
     */
    private function costOfGoods(Order $order): ?int
    {
        // Both checks, not one. The table can outlive the module (a migration
        // that was never rolled back) and the class can exist before the table
        // (a fresh install). Either alone lets one of those two states through,
        // and the failure would be a fatal error inside a posting job rather
        // than a missing cost line.
        $stockService = '\\Modules\\Inventory\\Services\\StockService';

        if (! class_exists($stockService) || ! Schema::hasTable('stock_movements')) {
            return null;
        }

        $stock = app($stockService);
        $total = 0;

        foreach ($order->items as $item) {
            if ($item->product_id === null) {
                return null;
            }

            $unit = $stock->averageCostPoisha($item->product_id);
            if ($unit === null) {
                return null;
            }

            $total += $unit * $item->qty;
        }

        return $total;
    }
}
