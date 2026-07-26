<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Users.
 *
 * Dated 0001_01_01 so it runs BEFORE every module migration — carts and orders
 * both have a foreign key to this table, and Laravel orders migrations by
 * filename, not by module.
 *
 * Phone is the unique identity, email is optional. See App\Models\User.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');

            // Normalised to 01XXXXXXXXX on write — see OrderService::normalisePhone().
            $table->string('phone', 24)->unique();
            $table->timestamp('phone_verified_at')->nullable();

            $table->string('email')->nullable()->unique();
            $table->timestamp('email_verified_at')->nullable();

            $table->string('password');
            $table->string('tier', 24)->default('standard');
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table): void {
            // Reset is by phone here, not email, for the same reason.
            $table->string('phone')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
    }
};
