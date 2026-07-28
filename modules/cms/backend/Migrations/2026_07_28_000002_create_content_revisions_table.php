<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every previous version of every block.
 *
 * Live editing means someone will paste the wrong thing into the home page
 * headline on a Friday afternoon. Without history the only recovery is
 * remembering what it said; with it, undo is a click. The row keeps the value
 * as it was BEFORE the edit, so restoring is reading one row rather than
 * replaying a chain.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_revisions', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('content_block_id')->constrained()->cascadeOnDelete();

            $table->text('value');
            $table->string('alt')->nullable();

            $table->unsignedBigInteger('changed_by_admin_id')->nullable();
            $table->string('changed_by_name')->nullable();

            $table->timestamps();

            $table->index(['content_block_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_revisions');
    }
};
