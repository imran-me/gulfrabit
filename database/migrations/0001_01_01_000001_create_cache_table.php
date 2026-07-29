<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Laravel's cache tables.
 *
 * Ships with a default Laravel install and was missing here, which is why
 * `GET /api/delivery/options` returned 500 while other endpoints worked:
 * `.env` sets `CACHE_STORE=database`, and DeliveryQuoteService wraps its zone
 * lookup in `Cache::remember`. Every cached read hit a table that did not
 * exist; every uncached one was fine.
 *
 * `cache_locks` is what `Cache::lock()` uses. Nothing here needs it yet, but it
 * belongs with its pair — half of a driver's schema is worse than none, because
 * the missing half fails only under the one condition nobody tested.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cache', function (Blueprint $table): void {
            $table->string('key')->primary();
            $table->mediumText('value');
            $table->integer('expiration');
        });

        Schema::create('cache_locks', function (Blueprint $table): void {
            $table->string('key')->primary();
            $table->string('owner');
            $table->integer('expiration');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cache');
        Schema::dropIfExists('cache_locks');
    }
};
