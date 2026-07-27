<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * B2B requests for quote.
 *
 * An RFQ is a lead, not an order: nothing is charged, nothing is reserved, and
 * the real price is agreed by a human afterwards. The indicative total stored
 * here is a SNAPSHOT of what the published tier pricing said at submission
 * time — useful for "did our price move since they asked?", never a commitment.
 *
 * Guests can submit. Procurement staff routinely request quotes before anyone
 * creates an account, and forcing a signup here loses the lead outright.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quote_requests', function (Blueprint $table): void {
            $table->id();

            // Human-facing reference, random rather than sequential — a
            // guessable one would let a competitor enumerate our pipeline.
            $table->string('reference', 24)->unique();

            // Null for a guest submission, which is the common case.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            $table->string('company');
            $table->string('contact_name');
            $table->string('contact_phone', 24);
            $table->string('contact_email')->nullable();

            $table->text('notes')->nullable();

            // What our published tier pricing implied at the time of asking.
            $table->unsignedBigInteger('indicative_total_poisha')->default(0);

            $table->enum('status', ['new', 'reviewing', 'quoted', 'won', 'lost'])->default('new');

            // Set when someone actually replies — the number that tells you
            // whether the B2B desk is responsive.
            $table->timestamp('responded_at')->nullable();

            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index('contact_phone');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quote_requests');
    }
};
