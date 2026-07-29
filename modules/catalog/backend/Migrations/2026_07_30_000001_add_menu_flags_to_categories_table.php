<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Menu visibility, kept separate from `is_active`.
 *
 * They answer different questions and collapsing them loses a real option:
 *
 *   is_active     = does this category exist on the site at all? Off hides the
 *                   category AND every product in it.
 *   show_in_menu  = should it appear in the header navigation? Off leaves the
 *                   category and its products fully shoppable and reachable by
 *                   link or search — it is simply not in the top nav.
 *
 * A merchant with eighteen categories cannot put all of them in a mobile menu,
 * and "hide it from the nav" must not mean "stop selling it".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table): void {
            $table->boolean('show_in_menu')->default(true)->after('is_active');
            // Highlighted categories get a larger tile on the home page. A
            // count, not a boolean, so the merchant controls the order too.
            $table->unsignedSmallInteger('menu_order')->default(0)->after('show_in_menu');
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table): void {
            $table->dropColumn(['show_in_menu', 'menu_order']);
        });
    }
};
