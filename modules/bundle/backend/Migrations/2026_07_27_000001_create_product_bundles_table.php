<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Merchant-curated pairings.
 *
 * Members are stored as an ordered JSON array of SKUs rather than as a pivot
 * table. A bundle is read whole, always — never "which bundles contain X, join
 * to products, order by position" — so a pivot would buy nothing but joins, and
 * the merchant's chosen order is part of the data. `reason` is not decoration:
 * it is the only justification the block has for existing before there is any
 * purchase history, and a bundle without one does not ship.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_bundles', function (Blueprint $table): void {
            $table->id();

            $table->string('key', 64)->unique();      // e.g. bdl-coffee-ritual
            $table->string('title');
            $table->text('reason');

            // Ordered list of product SKUs. Not FKs: a bundle naming a SKU that
            // is later delisted must degrade to "one fewer companion", not fail
            // to load, and BundleService drops unknown and out-of-stock members
            // when it resolves them.
            $table->json('members');

            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);

            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_bundles');
    }
};
