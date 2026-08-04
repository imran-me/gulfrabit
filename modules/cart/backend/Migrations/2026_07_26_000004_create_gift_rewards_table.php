<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gift-with-purchase thresholds.
 *
 * Spend BDT X, get product Y free. Rules are data for the same reason promo
 * codes are: merchandising changes the gift and the threshold far more often
 * than engineering deploys.
 *
 * Why a gift and not free delivery: at these basket sizes a physical product is
 * more motivating than a waived charge, it costs COGS rather than margin, and
 * it seeds trial of another SKU. It also keeps the delivery promise flat and
 * honest - see modules/delivery/README.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gift_rewards', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 48)->unique();

            $table->unsignedInteger('threshold_poisha');

            // The product given away. Restrict on delete: removing a product
            // that is actively promised as a gift should fail loudly, not
            // silently leave carts advertising a gift that cannot be fulfilled.
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();

            $table->string('teaser')->comment('"a free jar of dried oregano"');

            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'threshold_poisha']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gift_rewards');
    }
};
