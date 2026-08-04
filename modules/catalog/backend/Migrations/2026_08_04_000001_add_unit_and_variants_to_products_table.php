<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pack size, and the pack sizes a product is sold in.
 *
 * These two have been in modules/catalog/data/products.json and rendered by the
 * storefront since launch — `unit` sits under the price on every product card
 * ("500 g"), and `variants` is the pack-size selector on the PDP — but neither
 * ever had a column. The mock JSON carried them and the database did not, so
 * the day the API went live both would have silently disappeared from the shop,
 * and no admin screen could have put them back.
 *
 *   unit             the measure the shop sells in — "kg", "g", "pc". Used by
 *                    the PDP for the per-unit line ("৳ 2,650 / kg"), otherwise
 *                    display only.
 *   variants         [{ label, amount, price_poisha, original_price_poisha,
 *                    in_stock }] — the selectable packs. THE LABEL IS THE KEY:
 *                    cart lines and order rows record the variant by its label
 *                    ("500 g"), and the PDP selects by it. There is no id, and
 *                    inventing one would change a contract the whole cart
 *                    already depends on. `amount` is how many of `unit` the
 *                    pack contains, and exists for the per-unit price line.
 *                    JSON rather than a table on purpose: a variant has no
 *                    life of its own and is never queried across products.
 *   default_variant  the LABEL of the pack preselected on the PDP.
 *
 * Prices inside `variants` are stored in POISHA like every other money column
 * (see toPoisha in CatalogSeeder) — the JSON's taka are converted on the way
 * in. Money as a float is how rounding errors reach an invoice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->string('unit', 32)->nullable()->after('barcode')
                ->comment('Measure sold in — "kg", "pc". Drives the per-unit price line.');
            $table->json('variants')->nullable()->after('images')
                ->comment('[{label,amount,price_poisha,original_price_poisha,in_stock}] — label is the key');
            $table->string('default_variant', 96)->nullable()->after('variants')
                ->comment('variants[].label preselected on the PDP');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropColumn(['unit', 'variants', 'default_variant']);
        });
    }
};
