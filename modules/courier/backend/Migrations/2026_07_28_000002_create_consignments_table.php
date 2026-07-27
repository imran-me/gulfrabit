<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One handover of one order to one courier.
 *
 * Not a `courier_id` column on `orders`, because an order can be handed over
 * more than once: a failed delivery comes back and goes out again, sometimes
 * with a different carrier. A column would overwrite the first attempt and
 * with it the reason the second one exists.
 *
 * `cost_poisha` is what the COURIER charges us, which is not the delivery
 * charge the customer paid. Keeping both is the only way to know whether
 * delivery makes or loses money — and it is what the accounting module will
 * post as a cost of sale in 7.6.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consignments', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('courier_id')->constrained();

            $table->string('tracking_number', 64)->nullable();
            $table->string('consignment_ref', 64)->nullable()->comment("The courier's own id, if different");

            $table->enum('status', [
                'draft',        // created here, not yet handed over
                'booked',       // courier has accepted it
                'picked_up',
                'in_transit',
                'delivered',
                'failed',       // attempted, not delivered
                'returned',
                'cancelled',
            ])->default('draft');

            $table->unsignedInteger('cost_poisha')->nullable()->comment('What the courier charges US');

            // Cash on delivery the courier collects on our behalf and remits
            // later. Tracked separately because until it is remitted it is a
            // receivable, not revenue in the bank.
            $table->unsignedInteger('cod_amount_poisha')->default(0);
            $table->boolean('cod_remitted')->default(false);

            $table->unsignedBigInteger('assigned_by_admin_id')->nullable();
            $table->string('assigned_by_name')->nullable();

            $table->timestamp('handed_over_at')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'created_at']);
            $table->index('tracking_number');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consignments');
    }
};
