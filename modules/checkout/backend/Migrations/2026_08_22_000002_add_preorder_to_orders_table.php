<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An order that cannot be packed yet, and the checkout that produced two.
 *
 * WHY A BASKET CAN BECOME TWO ORDERS
 * ----------------------------------
 * Somebody puts 1kg of dates in the basket and a pre-order saffron beside it.
 * There are only three honest answers and two of them are bad: ship everything
 * when the saffron lands, which holds dates hostage for three weeks; or refuse
 * to mix, which means the cart has to reject an add and explain itself.
 *
 * So checkout splits. The dates ship today as an ordinary order and the
 * saffron becomes a second order that ships on arrival. `placement_ref` is
 * what remembers they were one basket — shared by every order written in one
 * checkout, so the confirmation screen can show them as a pair and the panel
 * can tell that this customer was not ordering twice.
 *
 * WHY THE DATE IS ON THE ORDER
 * ----------------------------
 * `preorder_ships_on` is the latest arrival among the order's lines — the day
 * the whole thing can go out. Copied onto the order rather than read back
 * through the products for the same reason every other figure on an order is a
 * snapshot: an order is a historical record. If the merchant later pushes the
 * arrival date back a fortnight, that must not silently rewrite what a customer
 * was promised at the moment they paid. It changes when somebody decides to
 * change it, and then it is a decision with a record.
 *
 * NULL means an ordinary order, which is every row that exists today.
 *
 * Indexed because the panel asks "what am I waiting on stock for?" — and
 * because the morning a shipment lands, "which orders can now be packed?" is
 * the first question anyone has.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->date('preorder_ships_on')->nullable()->after('delivery_eta');
            $table->string('placement_ref', 32)->nullable()->after('order_number');

            $table->index('preorder_ships_on');
            $table->index('placement_ref');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropIndex(['preorder_ships_on']);
            $table->dropIndex(['placement_ref']);
            $table->dropColumn(['preorder_ships_on', 'placement_ref']);
        });
    }
};
