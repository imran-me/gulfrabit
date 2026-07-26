<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Promo codes.
 *
 * Rules live in the database, not in PHP. Marketing changes a discount far more
 * often than engineering deploys, and every competitor studied that got this
 * right (Shajgoj's rule-based offers) could reconfigure campaigns without a
 * release. Hardcoded codes are how you end up shipping a hotfix for a coupon.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table): void {
            $table->id();

            // Always compared upper-cased, so store it that way.
            $table->string('code', 32)->unique();
            $table->string('label')->nullable()->comment('Shown on the cart line');

            // 'pct' = percentage off goods, 'flat' = fixed poisha off goods.
            $table->enum('type', ['pct', 'flat']);

            // Percent (1-100) for 'pct', poisha for 'flat'. One column because
            // the two are never both meaningful.
            $table->unsignedInteger('value');

            $table->unsignedInteger('min_subtotal_poisha')->default(0);
            // Caps a percentage promo, e.g. "10% off, up to BDT 500".
            $table->unsignedInteger('max_discount_poisha')->nullable();

            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();

            $table->unsignedInteger('usage_limit')->nullable()->comment('Null = unlimited');
            $table->unsignedInteger('used_count')->default(0);

            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'starts_at', 'ends_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotions');
    }
};
