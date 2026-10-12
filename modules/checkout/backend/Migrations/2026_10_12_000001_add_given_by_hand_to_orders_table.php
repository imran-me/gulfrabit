<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a member of staff gave away on an order they typed in.
 *
 * WHY THIS EXISTS
 * ---------------
 * A custom order — one taken by phone or by message — can now carry two things
 * a website order cannot: an extra discount, typed as a number of taka by the
 * person taking it, and free delivery, ticked by the same person. Both are
 * agreed on a call, with a customer, by somebody the shop trusts to agree them
 * (`orders.discount`), and both have to be readable afterwards: on the order
 * screen, on the slip, and by whoever asks at the end of the month how much
 * was given away and by whom.
 *
 * `extra_discount_poisha` IS PART OF `discount_poisha`, NOT BESIDE IT
 * -------------------------------------------------------------------
 * `discount_poisha` goes on meaning what it has always meant: everything taken
 * off the goods. This column says how much OF THAT a person gave by hand; the
 * rest is the coupon's. So
 *
 *     total = subtotal − discount + delivery
 *
 * stays true of every order, old and new, and the code that already relies on
 * it — the books (OrderPostingService), the storefront's tracking page, the
 * refund ceiling — is right about a discounted custom order without being
 * told that such a thing exists. A second column to be subtracted would have
 * been wrong everywhere it was not yet known about.
 *
 * `delivery_waived_poisha` IS WHAT WAS NOT CHARGED
 * ------------------------------------------------
 * `delivery_charge_poisha` on a free-delivery order is 0, which is the truth
 * about what the customer pays. This is the charge the district would have
 * carried — kept because "free, by our choice" and "this zone costs nothing"
 * are different facts, and only one of them is a cost the shop chose to bear.
 *
 * Both default to 0, which is the truth about every row that exists today and
 * about every order the storefront goes on to write: the checkout never names
 * either column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->unsignedInteger('extra_discount_poisha')->default(0)->after('discount_poisha');
            $table->unsignedInteger('delivery_waived_poisha')->default(0)->after('delivery_charge_poisha');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn(['extra_discount_poisha', 'delivery_waived_poisha']);
        });
    }
};
