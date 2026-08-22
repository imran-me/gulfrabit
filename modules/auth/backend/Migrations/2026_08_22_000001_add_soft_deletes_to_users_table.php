<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A customer can be taken off the list without being erased.
 *
 * DELETE AND FORGET ARE DIFFERENT ACTS
 * ------------------------------------
 * The panel already had one way to remove a customer: "forget", which
 * anonymises them in place — name, phone and email overwritten, past orders
 * kept with their figures intact — and is irreversible, owner-only, and
 * demands a typed reason. That is the GDPR-shaped act, for the day somebody
 * asks to be erased.
 *
 * It is a bad fit for the ordinary case, which is a test account, a duplicate,
 * or a number that turned out to be nobody. Using an irreversible erasure to
 * tidy a list is how an erasure log fills with entries that mean nothing, and
 * how the one real erasure request becomes impossible to find among them.
 *
 * So `deleted_at` is the tidying act: the customer leaves the list and every
 * count, keeps everything, and can be put back. Forget stays exactly where it
 * was, for what it was for.
 *
 * WHY THIS TABLE NEEDS MORE CARE THAN THE OTHERS
 * ----------------------------------------------
 * `phone` is unique and it is this project's identity primitive — checkout,
 * order tracking and OTP login all key off it. A soft-deleted row still holds
 * its phone number in that unique index, so the naive version of this change
 * breaks login: AuthService::loginWithVerifiedPhone does firstOrCreate on the
 * phone, the global scope hides the deleted row so nothing is found, and the
 * insert that follows hits the unique constraint. The customer proves they own
 * their number and is shown a database error.
 *
 * That is fixed in AuthService rather than here — it looks withTrashed and
 * restores — because the right answer to "a deleted customer came back and
 * proved they own the number" is that they are a customer again, not that they
 * are refused. See the note there.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->softDeletes();
            $table->index('deleted_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex(['deleted_at']);
            $table->dropSoftDeletes();
        });
    }
};
