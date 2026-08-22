<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A deleted category can be put back.
 *
 * The endpoint has existed since this controller was written and it hard
 * deleted, which was survivable only because it refuses in the two cases that
 * would do damage — a category with products in it, and a category with
 * sub-categories under it. Those guards stay exactly as they are; what they
 * could not cover is the third case, which is a merchant deleting the right
 * kind of category by mistake and having no way back.
 *
 * A category carries more than its name: a slug that is a live URL, a blurb,
 * an image, an audience, its place in the header menu order. Re-creating one
 * from memory produces a category that looks the same and is not — a new slug
 * breaks every link to it that exists in the world.
 *
 * Products sit on `category_id`, and a soft-deleted parent keeps its id, so a
 * restore reconnects everything by itself. That is the whole reason this is a
 * column and not a row that goes away.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table): void {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });
    }
};
