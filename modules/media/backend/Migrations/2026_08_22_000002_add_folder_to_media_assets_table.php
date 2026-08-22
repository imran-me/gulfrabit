<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which folder an image is filed under.
 *
 * NULL means the top level — "Unfiled" in the panel. It is nullable and not
 * defaulted to some catch-all folder row for two reasons: every image that
 * existed before folders did is already correct at NULL, and a library with no
 * folders at all must keep behaving exactly as it did, which it does when the
 * column is simply never set.
 *
 * nullOnDelete is a backstop, not the plan. FolderTree::delete() moves an
 * emptying folder's images up to its parent first, precisely so that deleting
 * a subfolder does not dump its contents at the top level. If a row is ever
 * removed some other way, landing at the top level is the only acceptable
 * failure: the image is still in the library, still on the live site, still
 * findable by search.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media_assets', function (Blueprint $table): void {
            $table->foreignId('folder_id')
                ->nullable()
                ->after('path')
                ->constrained('media_folders')
                ->nullOnDelete();

            // The library's default query is "this folder, newest first".
            $table->index(['folder_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::table('media_assets', function (Blueprint $table): void {
            $table->dropForeign(['folder_id']);
            $table->dropIndex(['folder_id', 'id']);
            $table->dropColumn('folder_id');
        });
    }
};
