<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Folders for the image library.
 *
 * THE ONE DECISION THAT SHAPES EVERYTHING ELSE: a folder is metadata, not a
 * directory. The files stay exactly where ImageStore puts them —
 * /uploads/YYYY/MM/<sha256>.webp, content-addressed and cached for a year.
 * A folder is a row here plus a `folder_id` on the asset.
 *
 * That is not a shortcut, it is the point:
 *
 *  - Moving 400 photos into a folder is one UPDATE, not 400 file moves. On a
 *    shared host, 400 file moves is a request that times out halfway and
 *    leaves the library in a state nobody can describe.
 *  - **No URL ever changes.** Every consumer of this library stores a plain
 *    path string — a product photo, a category icon, a hero slide. If
 *    reorganising folders rewrote paths, tidying up the library on a Tuesday
 *    would blank out pictures on the live shop, and the person who tidied
 *    would have no way to connect the two.
 *  - Deduplication still works. The same photo is one file no matter how many
 *    folders someone would like to file it under.
 *
 * WHY parent_id AND path. parent_id is the truth; `path` is a materialised
 * copy of the ancestry ("/3/7/") kept in step by FolderTree. Without it,
 * "everything under Ramadan 2026, including subfolders" is a recursive query
 * per screen paint, and "is this move a cycle?" is a loop that walks the tree.
 * With it both are one LIKE. The cost is that a move has to rewrite the paths
 * of its subtree, which happens in FolderTree and nowhere else.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media_folders', function (Blueprint $table): void {
            $table->id();

            // RESTRICT, not CASCADE. A cascade here means one mis-click deletes
            // a folder tree and, with it, the filing of every image under it.
            // FolderTree::delete() relocates children to the grandparent
            // explicitly, so the database never has to guess.
            $table->foreignId('parent_id')
                ->nullable()
                ->constrained('media_folders')
                ->restrictOnDelete();

            $table->string('name', 80);

            // Ancestry including self, id-based, slash-delimited and slash-
            // terminated: "/3/7/" is folder 7 inside folder 3. Never shown to
            // anyone — the breadcrumb is built from names — so ids are safe
            // here and a rename costs nothing.
            $table->string('path', 255);

            // 0 for a top-level folder. Denormalised from `path` so the depth
            // ceiling can be enforced with a comparison instead of a count.
            $table->unsignedTinyInteger('depth')->default(0);

            $table->foreignId('created_by')
                ->nullable()
                ->constrained('admin_users')
                ->nullOnDelete();

            $table->timestamps();

            // Listing a folder's children, and the subtree LIKE.
            $table->index(['parent_id', 'name']);
            $table->index('path');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_folders');
    }
};
