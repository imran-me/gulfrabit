<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How much of one product sits in one warehouse, right now.
 *
 * A CACHE, NOT THE TRUTH
 * ----------------------
 * The truth is stock_movements: an append-only ledger of every change with a
 * reason attached. This table is the running total, kept in step inside the
 * same transaction as each movement, so the common question ("how many do we
 * have") does not require summing a ledger that grows forever.
 *
 * That means it can be rebuilt from the movements at any time, and a
 * disagreement between the two is a bug with an audit trail rather than a
 * mystery.
 *
 * `qty_reserved` is stock promised to orders that have not shipped. Available
 * to sell is on_hand minus reserved — without that distinction, two customers
 * can buy the last jar between the order being placed and the parcel leaving.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_levels', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained()->cascadeOnDelete();

            // Signed, deliberately. Negative on-hand is wrong but it HAPPENS —
            // a sale recorded before a delivery is booked in. Forbidding it in
            // the schema would push the error somewhere invisible; allowing it
            // and reporting it makes the mistake findable.
            $table->integer('qty_on_hand')->default(0);
            $table->unsignedInteger('qty_reserved')->default(0);

            $table->unsignedInteger('reorder_level')->default(0);

            $table->timestamps();

            $table->unique(['product_id', 'warehouse_id']);
            $table->index('qty_on_hand');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_levels');
    }
};
