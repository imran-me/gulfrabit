<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The chart of accounts.
 *
 * `type` decides which side of an account increases it, which is the rule the
 * whole ledger rests on:
 *
 *   asset, expense      → DEBIT increases
 *   liability, equity, income → CREDIT increases
 *
 * Storing the type rather than a `normal_balance` string means the rule is
 * derived in one place and cannot be set inconsistently — an asset account
 * flagged as credit-normal would silently invert every report it appears in.
 *
 * `is_system` marks the accounts the software posts to automatically. Those
 * cannot be deleted or retyped from the UI: renaming "Sales revenue" is fine,
 * but turning it into an expense account would quietly rewrite every P&L that
 * was ever produced.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounts', function (Blueprint $table): void {
            $table->id();

            $table->string('code', 16)->unique();     // 1000, 4000 — sorts and speaks
            $table->string('name');
            $table->enum('type', ['asset', 'liability', 'equity', 'income', 'expense']);

            // Sub-accounts, so "Delivery expense" can sit under "Cost of sales"
            // without the report needing to know the hierarchy.
            $table->foreignId('parent_id')->nullable()->constrained('accounts')->nullOnDelete();

            $table->string('system_key', 40)->nullable()->unique()
                ->comment('Stable key the posting rules reference, e.g. sales_revenue');
            $table->boolean('is_system')->default(false);
            $table->boolean('is_active')->default(true);

            $table->text('description')->nullable();
            $table->timestamps();

            $table->index(['type', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounts');
    }
};
