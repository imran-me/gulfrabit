<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * How the hero MOVES — one row, and only ever one row.
 *
 * WHY NOT site_settings
 * ---------------------
 * That table exists and is general, and using it would have been one less
 * migration. It belongs to modules/theme though, and reaching into another
 * module's table for storage is the coupling the module rule is there to
 * prevent: deleting modules/theme would take the hero's speed with it, for no
 * reason a reader could ever guess. A module owns its own storage.
 *
 * WHY A TABLE FOR FOUR VALUES
 * ---------------------------
 * Because the alternative is a config file, and a merchant cannot edit a config
 * file at eleven at night when the carousel is too fast for the new banner's
 * text. Everything in here is a decision the shop makes, not a decision the
 * developer makes, and that is the line for what goes in a database.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hero_settings', function (Blueprint $table): void {
            $table->id();

            // How long each slide is held, in milliseconds.
            //
            // 6000 matches the CSS animation that fills the active dot — the
            // dot IS the progress bar for this number, and if the two disagree
            // the dot finishes early and then sits there, which reads as the
            // carousel having frozen. The API sends this value to the page and
            // the page drives the animation from it, so they cannot drift.
            $table->unsignedInteger('interval_ms')->default(6000);

            // How one slide becomes the next.
            $table->enum('transition', ['fade', 'slide', 'zoom', 'none'])->default('fade');

            // How long that transition takes. Kept apart from interval_ms
            // because they are different questions — "how long do I get to read
            // it" and "how quickly does it move" — and a merchant who wants a
            // slower carousel almost never wants a slower wipe.
            $table->unsignedSmallInteger('transition_ms')->default(600);

            // The easing curve, by name. A name rather than a cubic-bezier
            // string: this value reaches a stylesheet, and a free-text field
            // that lands in CSS is a field worth validating out of existence.
            $table->enum('easing', ['ease', 'ease-in-out', 'linear', 'spring'])->default('ease-in-out');

            // The slow drift over the image while a slide is held. Off by
            // default: it is the effect most likely to look cheap, and it
            // should be a choice somebody made rather than one they inherited.
            $table->boolean('ken_burns')->default(false);

            // Autoplay at all. A single-banner shop wants a still picture, and
            // a carousel of one that still ticks is a wasted timer.
            $table->boolean('autoplay')->default(true);

            $table->string('updated_by_name')->nullable();
            $table->timestamps();
        });

        // The one row. Created here so no code path ever has to handle "no
        // settings yet" — every reader can assume it exists, which removes a
        // null check from the storefront, the API and the panel alike.
        DB::table('hero_settings')->insert([
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('hero_settings');
    }
};
