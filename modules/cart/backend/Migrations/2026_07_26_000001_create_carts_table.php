<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Carts.
 *
 * A cart belongs to EITHER a guest token OR a user, never both at once — on
 * login the guest cart is merged into the user's and then deleted. Modelling it
 * as two nullable columns rather than two tables keeps the merge a single
 * update instead of a copy.
 *
 * Guests get a cart because in this market a large share of orders never
 * authenticate at all: checkout is guest-by-default, so the cart must be too.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('carts', function (Blueprint $table): void {
            $table->id();

            // Opaque token stored in an httpOnly cookie. Not a session id, so it
            // survives session rotation and stays valid across a login.
            $table->uuid('guest_token')->nullable()->unique();

            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();

            // Promo is held on the cart, not recomputed per request, so the
            // customer keeps the code they entered. The DISCOUNT is still
            // recalculated server-side every read — only the code is stored.
            $table->string('promo_code', 32)->nullable();

            $table->timestamps();

            // Abandoned-cart cleanup and recovery emails both need this.
            $table->index('updated_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('carts');
    }
};
