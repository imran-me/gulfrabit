<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every price and cost change, with who made it.
 *
 * WHY THIS IS WORTH A TABLE
 * -------------------------
 * A price is the one field customers screenshot. "It was ৳ 1,200 yesterday" is
 * a conversation that happens, and without a log the only honest answer is a
 * shrug. Orders already snapshot what was charged, so the customer is never
 * billed wrongly — this is about being able to explain the shelf price, which
 * is a different question and one nobody can answer from a column that gets
 * overwritten.
 *
 * Cost changes are logged for the opposite reason: margin reporting is only
 * trustworthy if the cost used for a period can be shown to be the cost that
 * was actually recorded then.
 *
 * Append-only. A wrong change is corrected by making another one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_price_changes', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('product_id')->constrained()->cascadeOnDelete();

            // Which money field moved: price, original_price or cost.
            $table->string('field', 24);

            // Nullable both sides: null → value is "a cost was recorded for the
            // first time", and value → null is "we no longer claim to know it".
            // Storing 0 for either would make both look like a real figure.
            $table->unsignedInteger('from_poisha')->nullable();
            $table->unsignedInteger('to_poisha')->nullable();

            $table->unsignedBigInteger('actor_admin_id');
            $table->string('actor_name');
            $table->text('reason')->nullable();

            $table->timestamps();

            $table->index(['product_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_price_changes');
    }
};
