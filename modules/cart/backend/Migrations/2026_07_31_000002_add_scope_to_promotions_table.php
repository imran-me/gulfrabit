<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Coupons that apply to *some* of the basket, not all of it.
 *
 * Until now every promotion was basket-wide: 10% off meant 10% off everything.
 * A shop running a launch offer on one brand, or clearing one category, had no
 * way to express that, and the workaround — cut the shelf price instead — loses
 * the "was ৳2400" anchor that makes the offer legible.
 *
 * WHY A JOIN TABLE AND NOT A JSON COLUMN
 * --------------------------------------
 * A JSON array of product ids would be smaller to write and impossible to
 * query. "Which offers apply to this product?" is the question the product page
 * asks on every render, and answering it by loading every promotion and
 * filtering in PHP gets slower with each campaign that has ever been created.
 * A join table answers it with an index.
 *
 * It also cascades: deleting a category or a product removes its rows here
 * rather than leaving a promotion pointing at nothing. A dangling target is
 * silently a discount that no longer applies, which nobody would notice.
 *
 * SCOPE IS SEPARATE FROM THE TARGET ROWS on purpose. A promotion with
 * scope='products' and zero targets is a promotion that applies to nothing —
 * which is the correct, safe state for one that is half configured. If scope
 * were inferred from "are there any target rows", that same half-configured
 * promotion would silently be basket-wide, which is the expensive direction to
 * get wrong.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table): void {
            $table->enum('scope', ['all', 'categories', 'products'])
                ->default('all')
                ->after('type')
                ->comment('What the discount applies to; targets are in promotion_targets');
        });

        Schema::create('promotion_targets', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('promotion_id')->constrained()->cascadeOnDelete();

            // Exactly one of these is set. Not a polymorphic pair of columns,
            // because two nullable foreign keys keep referential integrity —
            // a polymorphic target_id cannot be constrained, and the first
            // orphaned row would be a discount that quietly stopped applying.
            $table->foreignId('category_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->cascadeOnDelete();

            $table->timestamps();

            $table->unique(['promotion_id', 'category_id']);
            $table->unique(['promotion_id', 'product_id']);
            $table->index('product_id');
            $table->index('category_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotion_targets');

        Schema::table('promotions', function (Blueprint $table): void {
            $table->dropColumn('scope');
        });
    }
};
