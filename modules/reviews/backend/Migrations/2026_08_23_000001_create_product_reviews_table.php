<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customer reviews.
 *
 * WHY THIS TABLE EXISTS AT ALL, when products already carry `rating` and
 * `review_count`: because until now those two columns were the whole system.
 * They were numbers a seeder wrote, with nothing behind them — a product could
 * say "4.7 from 288 reviews" and there were no reviews. The product page
 * publishes them to Google as AggregateRating, which makes an invented number
 * a structured-data claim rather than just a decoration.
 *
 * So the columns stay, and they keep their job — the catalogue sorts and
 * filters on rating, and a join-with-aggregate on every listing query is the
 * wrong trade — but they become DERIVED. ReviewService recomputes them from
 * the published rows here and nothing else may write them. A stored aggregate
 * that anything can set is how you get back to where this started.
 *
 * VERIFIED PURCHASE IS THE POINT, not a badge. `order_id` is the order that
 * proves the reviewer bought the thing, recorded at submission and kept, so
 * the claim stays checkable later. A review with no order behind it cannot be
 * created through the API at all — see ReviewService::eligibility().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_reviews', function (Blueprint $table): void {
            $table->id();

            // CASCADE: a product deleted for good takes its reviews with it.
            // They are about that product and mean nothing without it — unlike
            // an order line, which is a record of a transaction that happened.
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();

            // nullOnDelete, not cascade. A customer erased under
            // AdminCustomerController::forget must not silently rewrite the
            // shop's ratings — the review stays, anonymous, and the number it
            // contributed stays true.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            // The proof. Nullable only so an erased or purged order cannot
            // delete a legitimate review; `verified_at` below records that the
            // check DID pass at the time, which is the fact that matters.
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();

            // A snapshot, like an order line's title. The users table can be
            // erased, renamed or gone; what was displayed beside this review
            // should not change underneath it years later.
            $table->string('author_name', 96);

            $table->unsignedTinyInteger('rating');          // 1..5, checked in the request
            $table->string('title', 120)->nullable();
            $table->text('body');

            /**
             * pending  — submitted, waiting for the merchant. NOT counted.
             * published— visible on the shop and counted in the aggregate.
             * rejected — kept, never shown. Kept rather than deleted so the
             *            same customer cannot resubmit the same abuse and have
             *            it look new, and so a rejection can be reversed.
             */
            $table->enum('status', ['pending', 'published', 'rejected'])->default('pending');

            // When the purchase check passed. Not a boolean: "verified" with no
            // date is a claim, with a date it is a record.
            $table->timestamp('verified_at')->nullable();

            $table->foreignId('moderated_by')->nullable()
                ->constrained('admin_users')->nullOnDelete();
            $table->timestamp('moderated_at')->nullable();

            $table->timestamps();

            // One review per customer per product. The constraint rather than a
            // check in PHP, because two taps on a slow connection is the most
            // ordinary way to get two, and the second one should lose at the
            // database rather than depend on a race being noticed.
            $table->unique(['product_id', 'user_id']);

            // The product page's query: this product, published, newest first.
            $table->index(['product_id', 'status', 'created_at']);

            // The moderation queue's query.
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_reviews');
    }
};
