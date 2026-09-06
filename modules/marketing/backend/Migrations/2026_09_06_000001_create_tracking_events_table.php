<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every funnel event the storefront fires, kept - with a visitor and a session
 * attached, so it can answer "how many people came, and where did they leave?"
 * rather than only "did that event fire?".
 *
 * WHY THIS TABLE EXISTS
 * ---------------------
 * The browser has always mirrored each event to POST /api/track, and until now
 * that endpoint read the payload, forwarded it to Meta when a token was set,
 * and threw the original away. The shop generated a complete record of its own
 * funnel and kept none of it.
 *
 * The cost showed up the night the first ad launched. Asked a simple question -
 * "is my tracking working?" - the merchant had no answer of their own. Every
 * check ran through Meta's dashboard or a browser extension, two of which
 * disagreed with each other and one of which was flatly wrong. Hours went into
 * re-proving something the shop already knew and had discarded.
 *
 * Meta answers "how did the ad perform". It cannot answer "which of my pages
 * loses people", because it never sees the pages nobody converted on. That gap
 * is what this table is for.
 *
 * IDENTITY, AND ITS LIMITS
 * ------------------------
 * visitor_id and session_id are random ids minted in the browser and kept in
 * localStorage. They carry nothing about the person: no name, no phone, no IP,
 * no fingerprint. A cleared browser is a new visitor and a second device is a
 * second visitor, so "visitors" is an honest lower bound on people rather than
 * a headcount - the correct trade for a shop that has no need to know who
 * anyone is.
 *
 * The session rotates after 30 minutes idle, the window every analytics tool
 * uses, so a shopper returning the next morning is a second visit rather than
 * one endless one.
 *
 * NOT AN ANALYTICS PRODUCT
 * ------------------------
 * One row per event; every report is a grouping over it. No pre-computed
 * funnels, no stitching across devices. Anything cleverer belongs in a real
 * analytics tool, and half-building one here would mean maintaining a bad one
 * forever.
 *
 * VOLUME
 * ------
 * A PageView per page per visitor: paid traffic can write tens of thousands of
 * rows a week. Nothing for MySQL, but not nothing forever. There is no
 * automatic pruning - deleting a merchant's data on a schedule nobody asked for
 * is worse than a large table - but the created_at index makes
 * `delete from tracking_events where created_at < ?` cheap when they want it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tracking_events', function (Blueprint $table): void {
            $table->id();

            // WHO (anonymously), and WHICH VISIT. Indexed with created_at
            // because every screen on the dashboard is either "distinct
            // visitors in a window" or "one session's events in order".
            $table->uuid('visitor_id')->nullable();
            $table->uuid('session_id')->nullable();

            // The Meta standard event name. Not an enum: the whitelist lives in
            // TrackController where it is enforced, and a migration is the
            // wrong file to have to edit when a sixth event is added.
            $table->string('event_name', 32);

            // The browser's event_id, so a row here can be matched against what
            // Meta received - the only way to answer "Meta counted 40
            // purchases, I recorded 44; which four?".
            $table->string('event_id', 64)->nullable();

            // INTEGER POISHA, never a float - the same rule as orders. A
            // fraction of a taka drifting across a report is an accounting
            // problem wearing a reporting costume. Null on events that carry no
            // money, which is different from zero.
            $table->unsignedBigInteger('value_poisha')->nullable();
            $table->string('currency', 8)->nullable();

            // WHERE. `path` is stored apart from the full URL because the
            // footprint groups by page, and grouping by a URL that carries a
            // different utm string on every row groups nothing.
            $table->string('path', 512)->nullable();
            $table->string('source_url', 2048)->nullable();
            $table->string('referrer', 2048)->nullable();

            // WHAT it was about.
            $table->json('content_ids')->nullable();
            $table->string('content_name', 255)->nullable();
            $table->unsignedInteger('num_items')->nullable();

            // First-touch attribution, flattened out of the blob the browser
            // sends. Flattened ON PURPOSE: the reports group by these, and
            // grouping by a JSON path is both slower and unindexable. The whole
            // blob is kept alongside for anything the columns miss.
            $table->string('utm_source', 128)->nullable();
            $table->string('utm_medium', 128)->nullable();
            $table->string('utm_campaign', 128)->nullable();
            $table->string('utm_content', 128)->nullable();
            $table->json('attribution')->nullable();

            // Whether the server copy reached Meta. Three states that are
            // genuinely different: skipped (no token configured), sent, failed.
            // Without this a merchant cannot tell "the Conversions API is off"
            // from "the Conversions API is broken".
            $table->string('capi_status', 16)->default('skipped');

            $table->timestamps();

            $table->index(['created_at']);
            $table->index(['event_name', 'created_at']);
            $table->index(['session_id', 'created_at']);
            $table->index(['visitor_id', 'created_at']);
            $table->index(['utm_campaign', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tracking_events');
    }
};
