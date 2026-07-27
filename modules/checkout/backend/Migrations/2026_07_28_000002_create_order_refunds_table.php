<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Money going back out.
 *
 * A separate table rather than a `refunded_poisha` column on orders, because
 * refunds are events: partial ones happen, they happen more than once, and each
 * needs its own reason, method and authoriser. A running total in a column
 * tells you the sum and nothing else — and the sum is the part you can always
 * recompute.
 *
 * This table is also what the accounting module will post journal entries from
 * (7.6), so it records the method the money actually went back by, not just the
 * amount.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_refunds', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();

            // Poisha, like every other money column in this project. Never a float.
            $table->unsignedInteger('amount_poisha');

            // How it went back. 'original' means the route it was paid by,
            // which is what the returns policy promises.
            $table->enum('method', ['original', 'bkash', 'nagad', 'bank', 'cash', 'store_credit']);
            $table->string('reference')->nullable()->comment('Gateway/bank transaction id');

            $table->text('reason');

            // Who authorised it. Required — money leaving the business without
            // a named person attached to it is how shrinkage goes unnoticed.
            $table->unsignedBigInteger('authorised_by_admin_id');
            $table->string('authorised_by_name');

            $table->timestamps();

            $table->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_refunds');
    }
};
