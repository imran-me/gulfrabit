<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A record that a customer asked to be forgotten, and that we did it.
 *
 * Deliberately holds NO identifiers — no name, no phone, no email. It stores
 * the user id (which now points at a scrubbed row), the reason, who performed
 * it and when. That is enough to prove the request was honoured and nothing
 * more, which is the whole point: a log of erasures that recorded who was
 * erased would be a way of un-erasing them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_erasures', function (Blueprint $table): void {
            $table->id();

            // No foreign key. The row it points at may legitimately be deleted
            // later, and this record must outlive it — that is what makes it
            // proof rather than a pointer.
            $table->unsignedBigInteger('user_id');

            $table->text('reason');
            $table->unsignedBigInteger('performed_by_id');
            $table->string('performed_by_name');

            $table->timestamps();

            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_erasures');
    }
};
