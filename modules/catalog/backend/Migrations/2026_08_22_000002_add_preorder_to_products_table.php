<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Products that have not landed yet.
 *
 * WHY A DATE AND NOT A STATUS
 * ---------------------------
 * The obvious shape was a status column — live / coming_soon / preorder — and
 * it is the wrong one, because it needs a human to change it on the right
 * morning. A shipment lands while everybody is asleep, and a product that is
 * still labelled "arriving 14 September" on the 15th is a shop that looks
 * abandoned.
 *
 * So the truth is a DATE, and the three states are read from it:
 *
 *   available_from IS NULL or in the past   → an ordinary product. Nothing
 *                                             about the existing catalogue
 *                                             changes; every row today is this.
 *   in the future, preorder_enabled = false → Coming soon. Listed with its
 *                                             date, not orderable, collects
 *                                             the phone numbers of people who
 *                                             want telling.
 *   in the future, preorder_enabled = true  → Pre-order. Orderable now, ships
 *                                             on arrival.
 *
 * The product promotes ITSELF on the morning it lands. Nobody has to remember.
 *
 * WHY THE LIMIT
 * -------------
 * `preorder_limit` is the count that may be sold before the shipment arrives —
 * because the whole hazard of a pre-order is selling 400 units of a 50-unit
 * container and finding out six weeks later. NULL means no cap, which is right
 * for a product being restocked from a supplier who always has it, and wrong
 * for a single seasonal import. Counted against, not decremented, so it cannot
 * drift out of step with the orders that are the real record.
 *
 * `in_stock` is deliberately left alone. It still means "there is some on the
 * shelf", which is exactly what the warehouse means by it, and a pre-order
 * product is quite correctly not in stock. What changes is that being out of
 * stock stops being the same question as not being orderable — see
 * Product::isOrderable().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->date('available_from')->nullable()->after('stock_display');

            $table->boolean('preorder_enabled')->default(false)->after('available_from');

            $table->unsignedSmallInteger('preorder_limit')->nullable()->after('preorder_enabled');

            // The storefront asks "what is arriving?" on the category page and
            // the home page, and the admin sorts a worklist by it. Without the
            // index that is a full scan on the largest table in the catalogue.
            $table->index('available_from');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropIndex(['available_from']);
            $table->dropColumn(['available_from', 'preorder_enabled', 'preorder_limit']);
        });
    }
};
