<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The debits and credits of one entry.
 *
 * Two unsigned columns rather than one signed amount. It is more storage and it
 * is worth it: "debit 500" and "credit -500" are the same number to a computer
 * and completely different to an accountant, and every report, export and
 * conversation about these books will be in debit/credit terms. A single signed
 * column forces every reader to remember the sign convention for five account
 * types.
 *
 * Exactly one of the two is non-zero on any line. The service enforces that,
 * along with the rule that matters most: within an entry, total debits must
 * equal total credits.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_lines', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('journal_entry_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->constrained();

            $table->unsignedBigInteger('debit_poisha')->default(0);
            $table->unsignedBigInteger('credit_poisha')->default(0);

            $table->string('memo')->nullable();

            $table->timestamps();

            $table->index(['account_id', 'journal_entry_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_lines');
    }
};
