<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Scan events for a consignment — ours and the courier's.
 *
 * Append-only, like the order status log. `external_id` lets a repeated poll or
 * a re-delivered webhook be recognised instead of duplicated: couriers resend,
 * and a tracking page that shows "Picked up" four times looks broken to the
 * customer even when nothing is wrong.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consignment_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('consignment_id')->constrained()->cascadeOnDelete();

            $table->string('status', 32);
            $table->string('description')->nullable();
            $table->string('location')->nullable();

            $table->enum('source', ['courier', 'staff', 'system'])->default('courier');
            $table->string('actor_name')->nullable();

            $table->string('external_id', 128)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();

            // The courier's own event id is unique per consignment, so a
            // redelivered webhook updates nothing rather than appending a
            // duplicate.
            $table->unique(['consignment_id', 'external_id']);
            $table->index(['consignment_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consignment_events');
    }
};
