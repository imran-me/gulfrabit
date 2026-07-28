<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every change in stock, ever. Append-only; this is the ledger.
 *
 * WHY A REASON IS MANDATORY
 * -------------------------
 * "We have 40 fewer than last month" is not information. "We sold 38 and broke
 * 2" is. Every movement carries a reason, and the reasons are a closed list so
 * they can be summed — shrinkage is a number you can only produce if damage and
 * theft were never recorded as generic adjustments.
 *
 * `unit_cost_poisha` is carried on RECEIPTS so cost of goods can be computed as
 * a weighted average of what was actually paid, rather than from a single
 * "current cost" field that quietly rewrites the past every time a supplier
 * raises a price. Until real supplier costs exist (context.md 8b/B5) this stays
 * null, and the accounting module reports that it cannot compute margin rather
 * than inventing one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained()->cascadeOnDelete();

            // Signed: +12 received, -3 sold. One column, so a sum is the answer.
            $table->integer('qty_delta');

            $table->enum('reason', [
                'receipt',      // stock arrived from a supplier
                'sale',         // an order shipped
                'return',       // a customer sent it back and it is resaleable
                'damage',       // broken, spoiled, expired
                'theft',        // known loss
                'count',        // a stocktake correction
                'transfer_in',
                'transfer_out',
            ]);

            $table->unsignedInteger('unit_cost_poisha')->nullable()
                ->comment('Receipts only — what WE paid per unit');

            // What caused it, when something did. Kept loose (a string type and
            // an id) rather than a polymorphic relation, because the causes live
            // in modules that may not be installed.
            $table->string('source_type', 32)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();

            $table->text('note')->nullable();

            $table->unsignedBigInteger('actor_admin_id')->nullable();
            $table->string('actor_name')->nullable();

            $table->timestamps();

            $table->index(['product_id', 'warehouse_id', 'created_at']);
            $table->index('reason');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
