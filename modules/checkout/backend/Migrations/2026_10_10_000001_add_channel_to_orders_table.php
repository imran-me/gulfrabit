<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How the order reached the shop.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until now every row in `orders` was written by the storefront, so "where did
 * this come from" had one answer and needed no column. A shop that sells on
 * Facebook does not take all of its orders that way: a customer rings, or
 * writes on WhatsApp, or replies to a post, and somebody types the order in by
 * hand. Those orders have to land in the same pipeline — same stages, same
 * slip, same courier booking — and still be tellable apart afterwards, because
 * "how much of this month came in by phone" is a real question and an order a
 * member of staff vouched for is a different thing from one a stranger typed
 * into a form at 3am.
 *
 * WHY NOT `ad_source`
 * -------------------
 * That column answers a different question — which advert recruited the
 * customer — and the campaign report groups by it. A phone order written into
 * it would turn up in that report as a campaign called "phone".
 *
 * `website` is the default, which is the truth about every row that exists
 * today and about every order the storefront goes on to write: the checkout
 * never sets this column and never needs to learn that it exists.
 *
 * The vocabulary is Order::CHANNELS. A string rather than an enum for the
 * reason `status` is one — adding "Instagram" must not need a schema change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->string('channel', 16)->default('website')->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn('channel');
        });
    }
};
