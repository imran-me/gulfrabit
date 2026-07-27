<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every status change an order has ever had.
 *
 * WHY AN EVENT LOG AND NOT JUST orders.status
 * -------------------------------------------
 * `orders.status` answers "where is it now". It cannot answer "who marked this
 * shipped, and when" — which is the only question that matters when a customer
 * says a parcel never arrived, or when a member of staff marks fifty orders
 * delivered at 2am. A column that is overwritten keeps no history at all.
 *
 * `actor_admin_id` is nullable and nullOnDelete-free on purpose: admin accounts
 * are disabled, never deleted (see the admin_users migration), so this always
 * resolves to a real named person. It is null only for changes the system made
 * itself — a courier webhook, or the customer cancelling their own order.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_status_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();

            $table->string('from_status', 24)->nullable();   // null = order created
            $table->string('to_status', 24);

            // Who. One of these is set, never both.
            $table->unsignedBigInteger('actor_admin_id')->nullable();
            $table->string('actor_name')->nullable();
            $table->enum('actor_type', ['staff', 'customer', 'system'])->default('staff');

            // Free text from the person making the change. The reason a
            // cancellation happened is worth more later than the fact of it.
            $table->text('note')->nullable();

            $table->timestamps();

            $table->index(['order_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_status_events');
    }
};
