<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a unit costs US — the missing half of every margin figure.
 *
 * WHY IT IS NULLABLE, AND WHY THAT MATTERS
 * ----------------------------------------
 * The catalogue has always carried `price` and `original_price` and no cost at
 * all, which means the accounting module can report revenue and cannot report
 * profit. Adding the column does not fix that: the real numbers come from
 * supplier invoices the owner has (context.md 8b/B5).
 *
 * So it stays NULL until somebody enters a real figure, and null means "cost
 * unknown" everywhere downstream. It must never default to zero — a zero cost
 * makes every sale look like 100% margin, which is a lie that reads as good
 * news and therefore never gets questioned.
 *
 * This is a STANDARD cost: a reference figure for planning and for pricing
 * decisions. The cost actually used for cost-of-goods is the weighted average
 * of real receipts in stock_movements.unit_cost_poisha, because a single
 * current-cost field silently rewrites the past every time a supplier raises a
 * price.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->unsignedInteger('cost_poisha')->nullable()->after('original_price_poisha')
                ->comment('Standard cost per unit. NULL = unknown, never 0.');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropColumn('cost_poisha');
        });
    }
};
