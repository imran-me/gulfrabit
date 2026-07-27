<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staff accounts — deliberately NOT the customers table.
 *
 * WHY A SECOND TABLE
 * ------------------
 * The storefront's `users` table is filled by anyone who types a phone number
 * and it authenticates by SMS OTP. If admin were a flag on that table, the
 * customer login form would also be the admin login form: every weakness in
 * customer auth — a leaked password, an intercepted OTP, a reused credential
 * from another site — would become an admin compromise. Separating them means
 * a customer account cannot become an admin account by any code path at all,
 * because there is no column to set.
 *
 * ROLES
 * -----
 * A single role per user, not a permission matrix. Five roles cover this
 * business, and a matrix nobody maintains ends up with everyone as owner. The
 * important separation is that `warehouse` can move stock without seeing the
 * P&L, and `editor` can change website copy without seeing customers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_users', function (Blueprint $table): void {
            $table->id();

            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');

            $table->enum('role', [
                'owner',      // everything, including staff management
                'manager',    // orders, customers, products, inventory, reports
                'warehouse',  // orders (fulfil only), inventory. No money.
                'accounts',   // accounting, expenses, reports. No customer PII edits.
                'editor',     // CMS content only.
            ])->default('manager');

            // Disable rather than delete: an ex-employee's journal entries and
            // order actions must keep pointing at a real, named person. Audit
            // trails with dangling user ids are how accountability disappears.
            $table->boolean('is_active')->default(true);

            $table->timestamp('last_login_at')->nullable();
            $table->string('last_login_ip', 45)->nullable();

            // Lockout after repeated failures. Counted per account rather than
            // per IP because the attacker chooses the IP and we choose the
            // account.
            $table->unsignedTinyInteger('failed_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();

            $table->rememberToken();
            $table->timestamps();

            $table->index(['is_active', 'role']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_users');
    }
};
