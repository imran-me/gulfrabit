<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Payment attempts, one row per try.
 *
 * amount_poisha is snapshotted from the order at intent time and the gateway
 * is told THIS number — if the order could somehow be edited between intent
 * and callback, the record must show what the customer was actually charged.
 *
 * restrictOnDelete on order_id, deliberately: an order with money movements
 * against it must not be deletable at all. Orders are historical records and
 * are never deleted in practice; this constraint is the backstop that keeps
 * "in practice" true where cash is involved.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->restrictOnDelete();
            $table->string('gateway', 10);
            $table->unsignedBigInteger('amount_poisha');
            $table->string('status', 12)->default('initiated')
                ->comment('initiated | completed | failed | cancelled');
            $table->string('gateway_ref', 64)->nullable()
                ->comment('bKash paymentID / Nagad paymentReferenceId');
            $table->string('trx_id', 64)->nullable()
                ->comment('the id the customer sees in their own app');
            $table->json('response')->nullable()
                ->comment('the gateway\'s last raw answer, for disputes');
            $table->timestamps();

            $table->index('order_id');
            $table->index('gateway_ref');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
