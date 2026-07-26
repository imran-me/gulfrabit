<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Order lines — full snapshots.
 *
 * Unlike cart_items, these do NOT read through to the product for their title
 * or price. A product can be renamed, repriced, delisted or soft-deleted, and
 * the order must still print exactly what was bought and what was paid.
 *
 * product_id is kept for reporting and reorder links, but it is nullable and
 * nullOnDelete: losing the product must never destroy the order line.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_items', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();

            // Snapshots — the reason this table exists.
            $table->string('sku', 32);
            $table->string('title');
            $table->string('brand')->nullable();
            $table->string('image')->nullable();
            $table->string('variant', 64)->nullable();

            $table->unsignedSmallInteger('qty');
            $table->unsignedInteger('unit_price_poisha');
            $table->unsignedInteger('line_total_poisha');

            $table->timestamps();

            $table->index('sku');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
