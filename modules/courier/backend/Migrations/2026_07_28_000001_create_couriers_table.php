<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The carriers we can hand a parcel to.
 *
 * Rows, not a PHP enum, because which couriers a business uses changes without
 * a deploy — a new one is onboarded, an old one is dropped after a bad month,
 * one is paused during a strike. `driver` names the code that talks to them;
 * several rows can share a driver (two accounts with the same courier), and a
 * courier with no adapter written yet uses the `manual` driver, which is a real
 * working option rather than a placeholder.
 *
 * Credentials are NOT stored here in plaintext — see the `credentials` column
 * comment. Until a gateway is actually connected the column stays null, and a
 * courier with no credentials is simply not `is_configured`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('couriers', function (Blueprint $table): void {
            $table->id();

            $table->string('key', 32)->unique();       // pathao, steadfast, redx…
            $table->string('name');
            $table->string('driver', 32)->default('manual');

            $table->string('tracking_url_template')->nullable()
                ->comment('e.g. https://…/track?id={tracking} — {tracking} is substituted');

            $table->string('support_phone', 24)->nullable();

            // Encrypted at rest by the model cast. A courier API key is enough
            // to create shipments billed to this account, so it is treated like
            // a password rather than like configuration.
            $table->text('credentials')->nullable()->comment('encrypted JSON');

            // Two separate flags on purpose. `is_active` is a business decision
            // ("we are not using RedX this month"); `is_configured` is a fact
            // ("no credentials, so the driver cannot call anything"). Collapsing
            // them hides why a courier is unavailable.
            $table->boolean('is_active')->default(true);
            $table->boolean('is_configured')->default(false);

            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('couriers');
    }
};
