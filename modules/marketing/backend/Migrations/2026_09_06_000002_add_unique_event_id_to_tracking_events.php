<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One row per event_id, enforced by the database.
 *
 * WHY A DUPLICATE WAS ALWAYS POSSIBLE
 * -----------------------------------
 * The browser mirrors each event with `fetch(..., { keepalive: true })`, which
 * exists precisely so the request survives the page being replaced - Purchase
 * fires at the moment checkout navigates. A request that outlives its page is
 * also a request the browser may retry, and a user double-tapping "Place
 * Order" on a slow connection produces the same shape.
 *
 * Nothing downstream noticed, because the browser and the Conversions API
 * deduplicate on event_id at META's end. The shop's own copy had no such
 * protection, so the dashboard could count a purchase twice while Events
 * Manager counted it once - and the merchant would have believed the number
 * that was wrong, because it was theirs.
 *
 * A UNIQUE INDEX, NOT A CHECK IN PHP
 * ----------------------------------
 * Two concurrent requests both SELECT, both find nothing, and both INSERT.
 * Only the database can settle that, so it does. TrackController catches the
 * violation and treats it as success, which is the honest outcome: the event
 * IS recorded, just not twice.
 *
 * MySQL permits many NULLs in a unique index, which is what makes this safe
 * for the events that arrive without an id rather than a reason to reject them.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Any duplicates already recorded are collapsed first, or the index
        // cannot be created. Keeps the earliest row of each id: the first
        // arrival is the one whose timestamp reflects when the thing actually
        // happened.
        $dupes = DB::table('tracking_events')
            ->select('event_id', DB::raw('MIN(id) as keep_id'))
            ->whereNotNull('event_id')
            ->groupBy('event_id')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($dupes as $d) {
            DB::table('tracking_events')
                ->where('event_id', $d->event_id)
                ->where('id', '!=', $d->keep_id)
                ->delete();
        }

        Schema::table('tracking_events', function (Blueprint $table): void {
            $table->unique('event_id');
        });
    }

    public function down(): void
    {
        Schema::table('tracking_events', function (Blueprint $table): void {
            $table->dropUnique(['event_id']);
        });
    }
};
