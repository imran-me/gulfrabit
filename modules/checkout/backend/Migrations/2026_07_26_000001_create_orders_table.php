<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Orders.
 *
 * An order is a HISTORICAL RECORD, not a view over current data. Every figure
 * and every address field is captured at purchase time and never recomputed
 * afterwards — if a product's price changes tomorrow, or a delivery zone is
 * repriced, or a customer edits their saved address, this row must still say
 * what was actually agreed. That principle drives most of the schema below.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table): void {
            $table->id();

            // Human-facing reference. Shown to the customer, quoted at support,
            // and never derived from the auto id — a guessable order number
            // lets anyone enumerate other people's orders on the tracking page.
            $table->string('order_number', 24)->unique();

            // Null for a guest order, which is the common case in this market.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            // Contact, captured at purchase. Phone is required because it is the
            // identity primitive here and the only reliable way couriers reach
            // the customer; email is optional and often absent.
            $table->string('customer_name');
            $table->string('customer_phone', 24);
            $table->string('customer_email')->nullable();

            // Address SNAPSHOT — deliberately flat strings, not a foreign key to
            // an addresses table. Editing a saved address must never rewrite
            // where a past parcel was sent.
            $table->string('address_line');
            $table->string('area')->nullable();
            $table->string('district_name', 64);
            $table->string('district_key', 64);
            $table->text('delivery_notes')->nullable();

            // Delivery snapshot. The zone key is stored rather than joined so a
            // deactivated or repriced zone cannot rewrite history.
            $table->string('delivery_zone_key', 32);
            $table->string('delivery_eta', 64);
            $table->unsignedInteger('delivery_charge_poisha');

            // Money, all in poisha, all server-computed at capture.
            $table->unsignedInteger('subtotal_poisha');
            $table->unsignedInteger('discount_poisha')->default(0);
            $table->unsignedInteger('total_poisha');

            $table->string('promo_code', 32)->nullable();

            $table->enum('payment_method', ['bkash', 'nagad', 'card', 'cod']);
            $table->enum('payment_status', ['pending', 'paid', 'failed', 'refunded'])->default('pending');
            $table->string('payment_reference')->nullable()->comment('Gateway transaction id');

            $table->enum('status', [
                'placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned',
            ])->default('placed');

            $table->timestamp('placed_at')->useCurrent();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index('customer_phone');   // guest order lookup on the tracking page
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
