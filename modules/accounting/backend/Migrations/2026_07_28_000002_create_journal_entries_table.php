<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One transaction in the books.
 *
 * POSTED ENTRIES ARE IMMUTABLE
 * ----------------------------
 * A draft can be edited or deleted. Once posted, an entry is never changed —
 * a mistake is corrected by a REVERSING entry that leaves both visible. That is
 * not ceremony: an accountant looking at last quarter has to see the same
 * numbers today that they saw then, and an editable ledger cannot promise it.
 *
 * `source_type`/`source_id` connect an entry back to the order, refund or
 * consignment that caused it, and the pair is unique so the same order can
 * never be posted twice — a double-posted sale is the single most common way
 * automated bookkeeping goes wrong.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_entries', function (Blueprint $table): void {
            $table->id();

            $table->string('reference', 32)->unique();
            $table->date('entry_date');
            $table->string('memo');

            $table->boolean('is_posted')->default(false);
            $table->timestamp('posted_at')->nullable();

            // What caused it. Nullable for manual entries typed by a person.
            $table->string('source_type', 32)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();

            // Set on the entry that reverses another, so a correction is
            // traceable in both directions.
            $table->foreignId('reverses_id')->nullable()->constrained('journal_entries')->nullOnDelete();

            $table->unsignedBigInteger('created_by_admin_id')->nullable();
            $table->string('created_by_name')->nullable();

            $table->timestamps();

            // The guard against double-posting the same event.
            $table->unique(['source_type', 'source_id']);
            $table->index(['entry_date', 'is_posted']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_entries');
    }
};
