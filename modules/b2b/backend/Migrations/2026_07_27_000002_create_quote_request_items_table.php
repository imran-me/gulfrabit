<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lines on an RFQ.
 *
 * A real quote request covers several parts — a board, the switches that go on
 * it, and the relay — so this is a table even though today's form submits one
 * line. Modelling it as a single product column would have to be undone the
 * first time someone asks for two things.
 *
 * Title and unit price are snapshotted for the same reason order lines are: the
 * quote must still read correctly after the catalog changes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quote_request_items', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('quote_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();

            $table->string('sku', 32);
            $table->string('title');

            $table->unsignedInteger('qty');

            // The tier price that applied to this quantity when they asked.
            $table->unsignedInteger('indicative_unit_poisha');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quote_request_items');
    }
};
