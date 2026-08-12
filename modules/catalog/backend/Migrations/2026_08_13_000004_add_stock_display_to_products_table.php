<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The number we TELL customers, which is not the number we have.
 *
 * `stock_display` drives the "Only 3 left" line on the product page. It is set
 * and lowered by hand in the panel, and it is deliberately NOT derived from
 * real stock — for two reasons that both matter:
 *
 *   1. Publishing a true count hands a competitor our sales rate. Watch a SKU
 *      for a week and you know exactly how fast it moves and what to undercut.
 *   2. A derived number goes back UP when a delivery lands. A scarcity line
 *      that recovers is a scarcity line nobody believes twice — and a shop
 *      that cries wolf about the last three packs has spent something it
 *      cannot buy back.
 *
 * Null means the line is not shown at all, which is the honest default and the
 * state every existing product starts in. Zero is a different statement — "we
 * are out" — and the storefront says so.
 *
 * The real per-pack count lives inside the `variants` JSON (stock_qty per row,
 * added in the same release) and never leaves the admin serialisation. Two
 * numbers, two audiences, no code path between them: that separation IS the
 * feature, and collapsing it later would be a regression, not a tidy-up.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->unsignedSmallInteger('stock_display')->nullable()->after('stock_qty')
                ->comment('Public "Only N left" figure — merchant-set, null = show nothing');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropColumn('stock_display');
        });
    }
};
