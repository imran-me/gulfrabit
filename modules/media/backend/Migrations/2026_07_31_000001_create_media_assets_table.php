<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The media library.
 *
 * WHY A TABLE AT ALL, when the files sit on disk and every consumer stores a
 * URL string anyway:
 *
 *  - Re-use. A category icon and a product photo are the same kind of thing;
 *    without a library the merchant re-uploads the same image per screen and
 *    we accumulate near-duplicates nobody can tell apart.
 *  - Deletion safety. `usage_count` is what lets the panel say "this image is
 *    on 3 products" instead of silently breaking them.
 *  - Provenance. Who uploaded what, and when. The same reason every other
 *    ledger in this build is append-only.
 *
 * The `hash` column is a sha256 of the ORIGINAL bytes and is unique: uploading
 * the same photo twice returns the existing row rather than writing a second
 * copy. That is the cheapest possible deduplication and it costs one index.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media_assets', function (Blueprint $table): void {
            $table->id();

            // sha256 of the bytes as uploaded, before any re-encode. 64 hex
            // chars. Unique, so a re-upload is a lookup, not a duplicate.
            $table->char('hash', 64)->unique();

            // Web path from the document root, e.g. /uploads/2026/07/ab12….webp
            // Stored as a path and not a full URL so the site can move domain.
            $table->string('path');

            $table->string('original_name');
            $table->string('mime', 64);
            $table->unsignedInteger('bytes');
            $table->unsignedSmallInteger('width')->nullable();
            $table->unsignedSmallInteger('height')->nullable();

            // Alt text is a first-class column, not an afterthought: it is the
            // only part of an image a screen reader and a search engine can
            // read. Nullable because it is honest to record "not written yet"
            // rather than default it to the filename, which is worse than
            // nothing — "IMG_4821.jpg" read aloud helps no one.
            $table->string('alt')->nullable();

            // Incremented when something attaches this asset, decremented when
            // it detaches. Advisory, not a constraint — see MediaAsset::detach.
            $table->unsignedInteger('usage_count')->default(0);

            $table->foreignId('uploaded_by')
                ->nullable()
                ->constrained('admin_users')
                ->nullOnDelete();

            $table->timestamps();

            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_assets');
    }
};
