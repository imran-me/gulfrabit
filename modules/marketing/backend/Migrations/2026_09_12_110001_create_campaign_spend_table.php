<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What each campaign cost, one row per campaign per day.
 *
 * WHY THE SHOP KEEPS ITS OWN COPY OF A NUMBER META ALREADY HAS
 * ------------------------------------------------------------
 * Ads Manager knows the spend and counts a Purchase the moment "Place order"
 * is pressed. In a cash-on-delivery shop that is a promise, not a sale: the
 * phone goes unanswered, the parcel is refused at the door, the order was
 * placed for fun. Meta will never know which, so its return-on-spend is
 * computed against revenue that partly never arrives.
 *
 * The shop knows. `orders.status` says what was delivered, and every tracked
 * purchase is already matched to its order. Put the spend beside it and the
 * screen can answer the question Ads Manager cannot: what did a DELIVERED
 * order cost, and which campaign is buying cancellations.
 *
 * ONE ROW PER DAY, NOT PER PERIOD
 * -------------------------------
 * Daily rows are what Meta reports and the only shape that can answer any
 * window afterwards - a lump sum entered for "last 30 days" cannot be split
 * when the merchant then asks about last week. `time_increment=1` on the
 * insights call returns exactly this.
 *
 * MONEY IS INTEGER, TWICE
 * -----------------------
 * `spend_poisha` is taka, converted at sync time, and is what every report
 * adds up. `amount_minor` + `currency` is what Meta actually said, kept
 * because an ad account billed in dollars is converted at a rate the merchant
 * sets, and a rate that changes must not silently rewrite history: the raw
 * figure stays, and the converted one is what a re-sync would refresh.
 *
 * `campaign_key` is Meta's own campaign id where the row came from Meta, and
 * the typed name where it was entered by hand. Unique with the date, so a
 * re-sync updates the day rather than adding it twice - the same reason the
 * events table has a unique event_id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_spend', function (Blueprint $table): void {
            $table->id();

            $table->string('campaign_key', 191);
            $table->string('campaign_name', 191);
            $table->date('spend_date');

            // Taka, for every report that adds spend up.
            $table->unsignedBigInteger('spend_poisha')->default(0);

            // What Meta said, in the ad account's own currency.
            $table->unsignedBigInteger('amount_minor')->default(0);
            $table->string('currency', 8)->default('BDT');

            // 'meta' - pulled from the Marketing API. 'manual' - typed in the
            // panel. A sync never overwrites a manual row: somebody typed it
            // for a reason, usually because Meta had nothing for that campaign.
            $table->string('source', 8)->default('meta');

            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->unique(['campaign_key', 'spend_date']);
            $table->index(['spend_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_spend');
    }
};
