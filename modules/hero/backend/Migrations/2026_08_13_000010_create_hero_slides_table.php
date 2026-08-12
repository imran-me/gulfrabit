<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The banners on the home page, and where each one sends you.
 *
 * WHY A TABLE AND NOT modules/cms
 * -------------------------------
 * The CMS deliberately edits two things and no more: text, and the src/alt of
 * an image. It cannot touch a link, because letting stored content set an href
 * is exactly the guarantee that module exists to keep. A hero slide is mostly
 * a link — the picture is how you decide to click it — so it needs its own
 * home with its own rules rather than a hole cut in that one.
 *
 * WHY THE LINK IS TWO COLUMNS
 * ---------------------------
 * `link_type` + `link_value`, not a single url string. A slide pointing at a
 * product should keep pointing at that product when the URL scheme changes —
 * and it is about to, when products get real URLs instead of ?id=. Storing the
 * finished href would freeze today's scheme into every banner ever made, and
 * the day the scheme changes every banner quietly 404s. The URL is built at
 * read time from the type and the id.
 *
 * `custom` exists for the campaign that points at something the shop does not
 * model — a landing page, a category filtered a particular way. It is the
 * escape hatch, and it is validated as a same-site path rather than a free URL:
 * a banner is a thing staff click a hundred times a day, and an admin account
 * that can point it at any host is an admin account that can phish the shop's
 * own customers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hero_slides', function (Blueprint $table): void {
            $table->id();

            // The picture. A path under /assets or /uploads, exactly what the
            // media library hands out — stored as a string and not a foreign
            // key, matching how every other consumer of media works here, so
            // deleting an asset cannot cascade a banner out of existence.
            $table->string('image_path');

            // Alt text is CONTENT, not decoration: a hero is the loudest thing
            // on the page and a screen reader gets nothing from "banner".
            // Required at the request layer.
            $table->string('alt');

            // Optional. Most of these banners are a finished piece of artwork
            // with the words already in the image, so headline/subtitle stay
            // nullable rather than forcing empty overlays onto every slide.
            $table->string('headline')->nullable();
            $table->string('subheadline')->nullable();

            $table->enum('link_type', ['product', 'category', 'custom', 'none'])->default('none');
            $table->string('link_value')->nullable()->comment('product id, category slug, or a site-relative path');

            // Hand-ordered. A merchant arranging a campaign cares which banner
            // is first, and "sort by created_at" is not an answer.
            $table->unsignedSmallInteger('sort_order')->default(0);

            // Off rather than deleted, so next Ramadan's banner can be built in
            // advance and switched on, and last year's kept to copy from.
            $table->boolean('is_active')->default(true);

            // A campaign that ends on its own. Null on both means "always".
            // Checked in the query, so a banner cannot outlive its sale because
            // somebody was away that weekend.
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();

            $table->string('updated_by_name')->nullable();
            $table->timestamps();

            // The storefront's only query: live slides, in order.
            $table->index(['is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hero_slides');
    }
};
