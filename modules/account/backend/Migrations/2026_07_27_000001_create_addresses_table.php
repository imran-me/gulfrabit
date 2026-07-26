<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Saved delivery addresses.
 *
 * Shape follows the checkout form exactly — name, phone, line, area, district —
 * because an address that cannot be dropped straight into checkout is just a
 * note. `postcode` is deliberately absent: Bangladeshi addresses are not routed
 * by one, and checkout does not collect it.
 *
 * The district is a real foreign key rather than free text, because it is what
 * prices delivery (modules/delivery). Free-text city was exactly the field that
 * made the old checkout unable to quote a charge.
 *
 * NOTE: orders do NOT reference this table — Order stores a flat snapshot.
 * Editing a saved address must never rewrite where a past parcel was sent.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('addresses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('label', 32)->default('Home')->comment('Home / Office / …');

            // Recipient, which is not always the account holder — gifts and
            // family orders are common.
            $table->string('recipient_name');
            $table->string('recipient_phone', 24);

            $table->string('line1');
            $table->string('area')->nullable();

            $table->foreignId('district_id')->constrained('districts')->restrictOnDelete();

            $table->text('notes')->nullable()->comment('Landmark, floor, delivery timing');

            $table->boolean('is_default')->default(false);

            $table->timestamps();

            // The listing query: a user's addresses, default first.
            $table->index(['user_id', 'is_default']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('addresses');
    }
};
