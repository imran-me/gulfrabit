<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where each visit came in, what it arrived on, and what it was about.
 *
 * The first migration stored the funnel. It could say "503 visits, 11 orders"
 * and nothing about WHICH 503: whether the ad's visitors bought or the
 * organic ones did, whether the phones inside Facebook's in-app browser were
 * the ones abandoning checkout, which product people opened forty times and
 * never added. Those are the questions a shop running Facebook ads asks every
 * morning, and every one of them needs a column this table did not have.
 *
 * SESSION-LEVEL, COPIED ONTO EVERY EVENT
 * --------------------------------------
 * channel, landing_path and visit_type describe the VISIT, and are decided by
 * its first event (Modules\Marketing\Services\VisitContext). They are copied
 * onto every later event of that visit so that any report can filter with a
 * plain where-clause - "Meta ads only" - without re-deriving the first event
 * of each session in a subquery.
 *
 * STILL NOBODY
 * ------------
 * device / os / browser are coarse buckets - "Phone", "Android", "Facebook
 * app" - read from the user agent, which is then dropped. The raw agent is not
 * stored, and neither is anything else that could single a person out.
 *
 * search_results is the number of result ids Search reported, capped at ten
 * by the storefront - so it answers "found nothing?" exactly and "how many?"
 * only up to ten, which is all the report needs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tracking_events', function (Blueprint $table): void {
            $table->string('channel', 24)->nullable()->after('capi_status');
            $table->string('landing_path', 512)->nullable()->after('channel');
            $table->string('visit_type', 12)->nullable()->after('landing_path');
            $table->string('referrer_host', 128)->nullable()->after('visit_type');

            $table->string('device', 12)->nullable()->after('referrer_host');
            $table->string('os', 16)->nullable()->after('device');
            $table->string('browser', 24)->nullable()->after('os');

            $table->string('product_id', 64)->nullable()->after('browser');
            $table->string('search_term', 128)->nullable()->after('product_id');
            $table->unsignedTinyInteger('search_results')->nullable()->after('search_term');

            // The segment filters on the screen, and the two reports that
            // group by something other than time.
            $table->index(['channel', 'created_at']);
            $table->index(['device', 'created_at']);
            $table->index(['product_id', 'created_at']);
            $table->index(['search_term', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('tracking_events', function (Blueprint $table): void {
            $table->dropIndex(['channel', 'created_at']);
            $table->dropIndex(['device', 'created_at']);
            $table->dropIndex(['product_id', 'created_at']);
            $table->dropIndex(['search_term', 'created_at']);

            $table->dropColumn([
                'channel', 'landing_path', 'visit_type', 'referrer_host',
                'device', 'os', 'browser',
                'product_id', 'search_term', 'search_results',
            ]);
        });
    }
};
