<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The 64 districts of Bangladesh, each mapped to the zone that prices it.
 *
 * The mapping is deliberately data, not logic: "which districts count as metro"
 * is a commercial decision that changes when the courier network changes, and it
 * must be editable without a deploy. Gazipur and Narayanganj sit next to Dhaka
 * but are priced nationwide — that is a business call, not a geographic one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('districts', function (Blueprint $table): void {
            $table->id();

            // Slug used by the frontend select ('dhaka', 'coxs-bazar').
            $table->string('key', 64)->unique();

            $table->string('name');
            $table->string('division', 32);

            $table->foreignId('delivery_zone_id')
                ->constrained('delivery_zones')
                // Restrict, not cascade: deleting a zone that still prices
                // districts is a mistake we want the database to refuse.
                ->restrictOnDelete();

            $table->timestamps();

            $table->index('division');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('districts');
    }
};
