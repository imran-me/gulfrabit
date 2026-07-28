<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Places stock physically sits.
 *
 * Even a single-location business gets a row here rather than an implicit
 * "somewhere". The moment a second location appears — an overflow room, a
 * Chattogram depot, goods held at a 3PL — a system that assumed one place has
 * to be rewritten, while one that always asked "which" just gains a row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warehouses', function (Blueprint $table): void {
            $table->id();

            $table->string('key', 32)->unique();
            $table->string('name');
            $table->string('address')->nullable();
            $table->string('district', 64)->nullable();

            // Which location fulfils online orders by default. Exactly one
            // should be true; the service enforces that rather than the schema,
            // because a partial unique index is not portable across the
            // databases this project has to run on.
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('warehouses');
    }
};
