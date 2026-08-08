<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every SMS attempt, kept.
 *
 * order_id is nullable with nullOnDelete for the same reason order lines
 * snapshot their product: losing an order must never damage the record that a
 * message was (or was not) sent to a real phone at a real time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->nullable()
                ->constrained('orders')->nullOnDelete();
            $table->string('phone', 20);
            $table->text('body');
            $table->string('gateway', 30);
            $table->string('status', 10)->comment('sent | failed');
            $table->text('response')->nullable()->comment('the gateway\'s raw answer');
            $table->timestamps();

            $table->index('phone');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_logs');
    }
};
