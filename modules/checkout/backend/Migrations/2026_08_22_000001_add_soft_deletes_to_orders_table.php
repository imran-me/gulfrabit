<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An order can be taken off the floor. It cannot be destroyed.
 *
 * WHY A COLUMN AND NOT A DELETE
 * -----------------------------
 * The panel needed a delete on the orders screen — a test order, a duplicate,
 * junk that should not have to sit in the Spam drawer forever. What it must
 * never have is `DELETE FROM orders`, for three reasons that all bite later:
 *
 * 1. Stock moved. A delivered order decremented a stock level through the
 *    inventory ledger, and those movement rows reference an order that would
 *    no longer exist. The stock stays decremented for a sale nobody can find.
 * 2. Money posted. modules/accounting writes journal entries when an order is
 *    posted, and the books read the LEDGER, not this table — so destroying the
 *    order would leave revenue on the P&L with nothing behind it to explain it.
 * 3. The order number is a promise. It is on a packing slip, in an SMS, and in
 *    a customer's hand. A number that resolves to nothing is worse than one
 *    that resolves to a deleted record.
 *
 * With `deleted_at`, Eloquent's global scope takes the order out of every
 * screen, every count and every dashboard figure — which is the whole of what
 * "delete" means to the person clicking it — while the row, its items, its
 * status history and its refunds all stay exactly where they were.
 *
 * THE BOOKS ARE DELIBERATELY NOT TOUCHED
 * --------------------------------------
 * Deleting an order that has already been posted does NOT reverse its journal
 * entry, and must not: unposting by side effect is how a set of books stops
 * balancing. Reversing is its own deliberate act on the Journal screen, and
 * the confirm dialog on the orders screen says so when the order has been paid.
 *
 * Indexed, because every admin list query now carries `deleted_at is null` and
 * an unindexed null check on the busiest table in the shop is a full scan on
 * the screen staff keep open all day.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->softDeletes();
            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropIndex(['deleted_at']);
            $table->dropSoftDeletes();
        });
    }
};
