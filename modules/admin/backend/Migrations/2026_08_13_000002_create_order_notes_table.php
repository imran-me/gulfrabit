<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staff notes against ONE ORDER.
 *
 * WHY NOT customer_notes, AND WHY NOT order_status_events
 * --------------------------------------------------------
 * A customer note is about a person and outlives every order they place —
 * "always ask for the back gate". An order note is about one parcel on one day:
 * "rider could not find the road, called, going out again Thursday". Filing the
 * second as the first buries a permanent judgement about someone under a fact
 * that expired on Thursday.
 *
 * And it is not an order_status_event, because a note is precisely the thing
 * you need to record when the status has NOT changed. That table's `to_status`
 * is NOT NULL for a reason; bending it to carry noteless events would make
 * "what state is this order in" a question with a nullable answer.
 *
 * APPEND-ONLY, LIKE EVERY OTHER TRAIL IN THIS PROJECT. No update, no delete
 * route. A note that can be edited after a dispute is not evidence of anything.
 *
 * Kept in modules/admin, matching customer_notes: notes are a panel artefact.
 * Delete the panel and the notes go; the orders remain untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_notes', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('order_id')->constrained()->cascadeOnDelete();

            $table->text('body');

            // Not nullOnDelete: admin accounts are disabled rather than deleted,
            // so this always resolves to a real named person.
            $table->unsignedBigInteger('author_admin_id');
            $table->string('author_name');

            $table->timestamps();

            // The only way this table is ever read: one order's notes, oldest
            // first, alongside its status history.
            $table->index(['order_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_notes');
    }
};
