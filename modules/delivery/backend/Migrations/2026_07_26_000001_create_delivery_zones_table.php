<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Delivery zones — the price and promise for each service area.
 *
 * Rates live in the database rather than in code because operations changes them
 * (fuel, courier contracts, a new metro city) far more often than engineering
 * ships. Storing the charge in poisha avoids float rounding on money.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_zones', function (Blueprint $table): void {
            $table->id();

            // Stable machine key referenced by orders and the frontend ('metro',
            // 'nationwide', 'express'). Never renamed once orders reference it.
            $table->string('key', 32)->unique();

            $table->string('label');
            $table->string('eta_text');

            // Whole poisha (1 BDT = 100 poisha). Integer money, never float.
            $table->unsignedInteger('charge_poisha');

            // Express is offered only where we run our own last mile, so it must
            // be switchable per zone without deleting the row and orphaning
            // historical orders that reference it.
            $table->boolean('is_active')->default(true);

            // Display order in the checkout list.
            $table->unsignedSmallInteger('sort_order')->default(0);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_zones');
    }
};
