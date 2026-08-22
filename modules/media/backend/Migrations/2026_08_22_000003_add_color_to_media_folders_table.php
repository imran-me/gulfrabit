<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A colour on a folder.
 *
 * Not decoration. A tree of twenty folders in one grey is read by name, one
 * row at a time; the same tree with "Products" amber and "Campaigns" rose is
 * read by shape, and the merchant stops re-reading labels they already know.
 * It is the cheapest navigation aid there is.
 *
 * A TOKEN, NOT A HEX. The column stores 'amber', never '#f59e0b', for two
 * reasons: a free hex lets someone pick white-on-white and produce a folder
 * they cannot see, and a token resolves through the theme, so the palette
 * still works when the panel is not the colour it is today.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media_folders', function (Blueprint $table): void {
            // NULL is the default grey, and is a real answer rather than a
            // missing one: most folders should not be shouting.
            $table->string('color', 16)->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('media_folders', function (Blueprint $table): void {
            $table->dropColumn('color');
        });
    }
};
