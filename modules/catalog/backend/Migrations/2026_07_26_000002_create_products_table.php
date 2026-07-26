<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Products.
 *
 * Money is stored in **poisha** (1 BDT = 100 poisha) as unsigned integers.
 * Prices must never be floats — a rounding drift of a fraction of a taka across
 * a cart is a real accounting problem, not a cosmetic one.
 *
 * `specs`, `price_tiers`, `tags`, `dietary` and `images` are JSON columns. They
 * are read as whole documents and never filtered on in SQL at this catalog size
 * (44 SKUs); if that changes, promote `tags` to a pivot table before reaching
 * for JSON path queries.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table): void {
            $table->id();

            // Public SKU — 'gr-1001'. Appears in URLs, orders and the barcode
            // block, so it is immutable once an order references it.
            $table->string('sku', 32)->unique();

            $table->string('title');
            $table->string('brand')->nullable();
            $table->string('origin', 64)->nullable()->comment('Country of origin — a trust signal, shown on the PDP');
            $table->string('barcode', 32)->nullable()->comment('EAN-13; checkable against the physical pack');

            $table->foreignId('category_id')->constrained('categories')->restrictOnDelete();
            $table->foreignId('sub_category_id')->nullable()->constrained('categories')->nullOnDelete();

            $table->unsignedInteger('price_poisha');
            // Was-price for the strike-through. Null means "not discounted" —
            // never store it equal to price, or the UI cannot tell the difference.
            $table->unsignedInteger('original_price_poisha')->nullable();

            $table->string('image')->nullable();
            $table->json('images')->nullable();

            $table->decimal('rating', 2, 1)->default(0);
            $table->unsignedInteger('review_count')->default(0);

            $table->boolean('in_stock')->default(true);
            $table->unsignedInteger('stock_qty')->nullable()->comment('Null = not tracked');

            $table->json('tags')->nullable();
            $table->json('dietary')->nullable();

            $table->text('short_description')->nullable();
            $table->longText('description')->nullable();

            // B2B fields. Null on retail SKUs.
            $table->unsignedInteger('moq')->nullable()->comment('Minimum order quantity');
            $table->json('price_tiers')->nullable()->comment('[{qty, price_poisha}] volume breaks');
            $table->json('specs')->nullable();
            $table->string('datasheet')->nullable();

            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            // The three queries the storefront actually runs.
            $table->index(['category_id', 'is_active']);
            $table->index(['is_active', 'price_poisha']);
            $table->index('brand');
            $table->fullText(['title', 'brand', 'short_description']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
