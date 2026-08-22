<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Tell me when I can buy this."
 *
 * One table serving two questions that are the same question from the
 * customer's side: a product that has sold out, and a product that has not
 * arrived yet. Both are somebody standing in front of a thing they want and
 * cannot have, and both are answered by the same message on the same day.
 *
 * WHY THIS IS WORTH A TABLE
 * -------------------------
 * The shop already had a "Notify Me" button on every sold-out card. It was
 * rendered disabled and wired to nothing — a control that named a thing it
 * could not do. Every press of it was demand the shop was told about and threw
 * away.
 *
 * It is also the cheapest demand signal a merchant can have. Forty people
 * waiting on a Coming soon product is the difference between ordering one
 * container and ordering three, and it arrives BEFORE the money is committed.
 *
 * Phone, not email. It is this project's identity primitive everywhere else —
 * checkout, order tracking and OTP login all key off it — and a large share of
 * this market has no email address at all.
 *
 * Unique on (product, phone): asking twice is the same person being impatient,
 * not two people waiting. Without it a customer who taps three times triples
 * their apparent demand and gets three texts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_alerts', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('phone', 24);

            // Set when the message actually goes out, so a re-stock does not
            // text the people who were told about the last one. Null is the
            // whole worklist: everyone still waiting.
            $table->timestamp('notified_at')->nullable();

            $table->timestamps();

            $table->unique(['product_id', 'phone']);
            // "Who is still waiting for this?" — the only query that runs on
            // this table in anger, on the morning a shipment lands.
            $table->index(['product_id', 'notified_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_alerts');
    }
};
