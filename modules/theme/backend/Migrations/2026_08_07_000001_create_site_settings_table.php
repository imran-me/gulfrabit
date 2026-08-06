<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A key/value table for settings that belong to the SHOP rather than to a
 * product, an order or a person.
 *
 * Deliberately general and deliberately tiny. The theme is the first such
 * setting and would have fitted in a one-row `themes` table, but the next one
 * — a maintenance banner, a default currency, a cut-off time for same-day
 * despatch — would then have arrived as a second bespoke table, and the one
 * after that as a third. One table, string keys, JSON values.
 *
 * NOT a cache and not a place for anything secret: this is read by a public
 * endpoint, so every value in here must be safe to hand to a browser.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_settings', function (Blueprint $table): void {
            // The key IS the primary key. Settings are looked up by name and
            // there is exactly one row per name, so an auto-increment id would
            // be a second identity for the same thing and would let two rows
            // claim the same setting.
            $table->string('key', 64)->primary();
            $table->json('value');
            // Who changed the shop's appearance, and when. Not an audit log —
            // just enough to answer "why does the site look different today".
            $table->string('updated_by', 120)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_settings');
    }
};
