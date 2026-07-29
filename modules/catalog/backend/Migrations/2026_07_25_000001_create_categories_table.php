<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Catalog categories.
 *
 * `audience` splits retail from B2B. It is a column rather than a separate table
 * because the difference is presentational — an industrial category renders a
 * spec sheet and an RFQ path instead of an add-to-cart — not structural.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table): void {
            $table->id();

            // Public key. Every URL and payload uses this, never the auto id.
            $table->string('slug', 96)->unique();

            $table->string('name');
            $table->string('icon', 48)->nullable();
            $table->string('image')->nullable();
            $table->text('blurb')->nullable();

            $table->enum('audience', ['retail', 'b2b'])->default('retail');

            // Self-referencing: sub-categories point at their parent. Nullable
            // because top-level categories have none.
            $table->foreignId('parent_id')
                ->nullable()
                ->constrained('categories')
                ->nullOnDelete();

            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);

            $table->timestamps();

            $table->index(['audience', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
