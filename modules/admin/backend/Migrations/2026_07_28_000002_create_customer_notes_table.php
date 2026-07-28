<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staff notes against a customer.
 *
 * Append-only, attributed, and never shown to the customer. That last part is
 * why attribution matters: an internal note is written in a different voice
 * from a message, and the person who wrote "refuses cold-chain surcharge, do
 * not argue" should be findable six months later.
 *
 * Kept in modules/admin rather than with the users table because it is an admin
 * artefact — delete the panel and these go with it, while customers remain.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_notes', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->text('body');

            // Not nullOnDelete: admin accounts are disabled rather than deleted
            // (see the admin_users migration), so this always resolves to a
            // real named person.
            $table->unsignedBigInteger('author_admin_id');
            $table->string('author_name');

            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_notes');
    }
};
