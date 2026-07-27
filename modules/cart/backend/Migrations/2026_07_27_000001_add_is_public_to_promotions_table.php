<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks a promo code as advertisable.
 *
 * The product page now lists the offers that apply to an item, which means
 * something has to decide which codes may be printed in public. Without this
 * flag, "every redeemable promotion" is the only available answer — and the
 * first targeted win-back code, or an influencer's code, would appear on all 44
 * product pages the moment it was created.
 *
 * DEFAULT FALSE, deliberately. A new code is private until someone decides to
 * publish it. The opposite default leaks by omission, and the omission is only
 * noticed after the code is already public.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table): void {
            $table->boolean('is_public')->default(false)->after('is_active')
                ->comment('May this code be advertised on product pages?');
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table): void {
            $table->dropColumn('is_public');
        });
    }
};
