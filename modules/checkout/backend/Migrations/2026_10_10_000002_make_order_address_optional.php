<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The street address stops being compulsory in the TABLE, as it already has in
 * the form.
 *
 * WHY THIS EXISTS
 * ---------------
 * PlaceOrderRequest has accepted an order with no street address since the
 * express checkout was cut down to a name, a phone and a district — the
 * address is settled on the confirmation call, and the order screen has an
 * "Add" button beside "Not recorded yet" for exactly that. The request, the
 * panel, the order image and the receipt were all changed to match.
 *
 * The column was not. `address_line` was created NOT NULL and nothing altered
 * it, so the order that the form now permits is an INSERT the database
 * refuses: an empty address arrives as NULL (ConvertEmptyStringsToNull), the
 * write fails, and the customer is told the order could not be placed. Every
 * layer above the schema agreed the address was optional and the schema had
 * the last word.
 *
 * Orders taken by phone need the same thing — "I will send the address on
 * WhatsApp" is still an order — which is how this was found.
 *
 * DOWN puts the constraint back, and has to fill the gaps first: a NOT NULL
 * column cannot be restored over rows that are NULL. They become the empty
 * string, which every reader of this column already treats as "not recorded".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->string('address_line')->nullable()->change();
        });
    }

    public function down(): void
    {
        DB::table('orders')->whereNull('address_line')->update(['address_line' => '']);

        Schema::table('orders', function (Blueprint $table): void {
            $table->string('address_line')->nullable(false)->change();
        });
    }
};
