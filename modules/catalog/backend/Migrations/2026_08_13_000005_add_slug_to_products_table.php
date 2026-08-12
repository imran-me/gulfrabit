<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * A readable name for a product's URL.
 *
 * Until now a product's address was `product.html?id=gr-1101`. That string
 * carries no words, so a search engine reads nothing from it, and nobody can
 * say it aloud, print it on a leaflet, or recognise it in a WhatsApp message.
 * `/product/ajwa-dates-madinah-select` is the same page and tells you what it
 * is before it loads.
 *
 * WHY A COLUMN AND NOT A COMPUTED STRING
 * --------------------------------------
 * A slug derived from the title on every render would silently change the
 * moment anyone corrected a typo in a product name — and a URL that changes
 * is a URL that 404s for everyone who bookmarked, shared or indexed it. Stored
 * once, it survives renames. It is identity, like `sku` and `barcode`, and the
 * panel treats it that way.
 *
 * BACKFILLED HERE, NOT BY A COMMAND
 * ---------------------------------
 * Every existing product gets its slug inside this migration. A nullable
 * column plus a "remember to run the backfill" note is how half a catalogue
 * ends up with no slugs and a screen full of broken links — the deploy would
 * report success while the shop quietly lost its product pages.
 *
 * Collisions get -2, -3 appended. Two products genuinely called the same thing
 * is a merchandising problem, not a reason for a migration to fail.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->string('slug', 191)->nullable()->after('sku');
        });

        $taken = [];

        // Ordered by id so the backfill is deterministic: run it on a copy of
        // the database and you get the same slugs, which matters when the
        // suffixes below decide which of two identical titles keeps the clean
        // one.
        foreach (DB::table('products')->orderBy('id')->get(['id', 'sku', 'title']) as $product) {
            $base = Str::slug((string) $product->title);

            // A title with nothing sluggable in it — punctuation only, or a
            // script Str::slug cannot transliterate — must still produce a
            // usable URL rather than an empty one.
            if ($base === '') {
                $base = Str::slug((string) $product->sku) ?: 'product';
            }

            $slug = $base;
            $n = 2;
            while (isset($taken[$slug])) {
                $slug = $base . '-' . $n++;
            }
            $taken[$slug] = true;

            DB::table('products')->where('id', $product->id)->update(['slug' => $slug]);
        }

        // Unique only AFTER the backfill: adding the constraint first would
        // reject the very rows this migration exists to fill.
        Schema::table('products', function (Blueprint $table): void {
            $table->unique('slug');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropUnique(['slug']);
            $table->dropColumn('slug');
        });
    }
};
