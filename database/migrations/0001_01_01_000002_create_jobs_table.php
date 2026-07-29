<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Laravel's queue tables.
 *
 * `.env` sets `QUEUE_CONNECTION=database`, so anything dispatched to a queue
 * needs these. Nothing does yet — but the moment something is queued (an order
 * confirmation email, a courier tracking sync) it would fail at dispatch, and
 * the failure would look like the feature never fired rather than like a
 * missing table.
 *
 * `failed_jobs` matters most. Without it a job that throws is simply lost: no
 * row, no retry, no record that it ever ran. With it, a failure is a row
 * somebody can read.
 *
 * NOTE: a queue table is not a queue. Rows sit here until a worker runs
 * `queue:work`, and shared hosting has no long-running process — so anything
 * queued needs a cron entry calling `queue:work --stop-when-empty`, or it will
 * accumulate silently.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('jobs', function (Blueprint $table): void {
            $table->id();
            $table->string('queue')->index();
            $table->longText('payload');
            $table->unsignedTinyInteger('attempts');
            $table->unsignedInteger('reserved_at')->nullable();
            $table->unsignedInteger('available_at');
            $table->unsignedInteger('created_at');
        });

        Schema::create('job_batches', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('name');
            $table->integer('total_jobs');
            $table->integer('pending_jobs');
            $table->integer('failed_jobs');
            $table->longText('failed_job_ids');
            $table->mediumText('options')->nullable();
            $table->integer('cancelled_at')->nullable();
            $table->integer('created_at');
            $table->integer('finished_at')->nullable();
        });

        Schema::create('failed_jobs', function (Blueprint $table): void {
            $table->id();
            $table->string('uuid')->unique();
            $table->text('connection');
            $table->text('queue');
            $table->longText('payload');
            $table->longText('exception');
            $table->timestamp('failed_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('jobs');
        Schema::dropIfExists('job_batches');
        Schema::dropIfExists('failed_jobs');
    }
};
