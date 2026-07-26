<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One-time codes for phone login.
 *
 * OTP-first, because that is how this market authenticates: Ghorer Bazar leads
 * with "Send OTP" and treats password as the fallback, and Shajgoj does the
 * same. A large share of customers have no email, and many do not keep a
 * password for a store they use twice a year — but everyone has their phone.
 *
 * Security notes, all of which matter because each SMS costs money and the
 * endpoint is trivially scriptable:
 *  - the code is stored HASHED, never in the clear
 *  - short TTL, single use, and a hard attempt cap per code
 *  - requests are throttled per phone AND per IP at the route
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('otp_codes', function (Blueprint $table): void {
            $table->id();

            $table->string('phone', 24)->index();

            // Hashed. A leaked database must not hand out live login codes.
            $table->string('code_hash');

            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();

            // Kept for abuse investigation, not for identification.
            $table->string('request_ip', 45)->nullable();

            $table->timestamps();

            // The lookup the verify path runs.
            $table->index(['phone', 'consumed_at', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('otp_codes');
    }
};
