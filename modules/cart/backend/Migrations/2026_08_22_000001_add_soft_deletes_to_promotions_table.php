<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A deleted promo code can be put back — and its targets come back with it.
 *
 * The endpoint already refuses to delete a code that has been used, because a
 * used code is the only record of what that campaign cost. That guard stays.
 * What it does not cover is the ordinary mistake: deleting the code that was
 * typed wrong instead of the one next to it, on the morning of the campaign.
 *
 * Hard deleting also took the promotion_targets rows with it, by cascade. A
 * code scoped to eleven products was eleven decisions, and re-creating it
 * meant making all eleven again from memory. A soft delete leaves those rows
 * attached to a promotion id that still exists, so restore returns the code
 * AND its scope.
 *
 * `code` is unique. A soft-deleted row keeps it, so re-creating a deleted code
 * by hand collides — which is the right answer rather than a bug to design
 * around: the code is already there, and the merchant wants it restored.
 * AdminPromotionController::store says exactly that when it happens.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table): void {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });
    }
};
