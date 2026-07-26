<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Curated search synonyms per product.
 *
 * Separate migration rather than editing the create-products one: that migration
 * has already been written against and could have run somewhere, and rewriting
 * applied migrations is how environments silently diverge.
 *
 * Contents include romanised Bangla ("khejur" for dates, "modhu" for honey),
 * everyday synonyms ("headset"), and common misspellings. See
 * tools/gen-search-terms.py for how they are produced and why.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->json('search_terms')->nullable()->after('dietary');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropColumn('search_terms');
        });
    }
};
