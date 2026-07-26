<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Wishlist.
 *
 * Deliberately NOT a snapshot, unlike order lines: a wishlist is a pointer to
 * something you still intend to buy, so it must show today's price and today's
 * stock. Storing a price here would let the list quietly advertise a number we
 * no longer honour.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wishlist_items', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();

            $table->timestamps();

            // Saving the same product twice is a no-op, not a second row.
            $table->unique(['user_id', 'product_id']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wishlist_items');
    }
};
