<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cart lines.
 *
 * `added_price_poisha` is a SNAPSHOT of what the product cost when it went in
 * the cart. It is NOT what the customer is charged — the live product price is,
 * resolved on every read. The snapshot exists so the cart can say "this went up
 * since you added it", which is honest and prevents the nastier version of the
 * bug where a stale client price is quietly trusted at checkout.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cart_items', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('cart_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();

            // Nullable until variants exist; part of the uniqueness key so the
            // same product in two variants is two lines, not one.
            $table->string('variant', 64)->nullable();

            $table->unsignedSmallInteger('qty')->default(1);

            $table->unsignedInteger('added_price_poisha');

            $table->timestamps();

            // One line per product+variant per cart. Adding an existing product
            // increments qty rather than creating a duplicate row.
            $table->unique(['cart_id', 'product_id', 'variant']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cart_items');
    }
};
