<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Archiving — the third thing that can happen to a product.
 *
 * WHY IT IS NOT `is_active = false`, which was the first answer and the wrong
 * one. Unlisted already means something else and something unavoidable: EVERY
 * product is created unlisted, on purpose, so nothing appears on the live shop
 * mid-typo. If archived meant unlisted, every newly created product would be
 * born in the archive, which is the opposite of what an archive is for.
 *
 * So there are three states and they are genuinely three:
 *
 *   listed      is_active = true                on the shop
 *   unlisted    is_active = false               in the working catalogue,
 *                                               not on the shop — where new
 *                                               products start and where a
 *                                               restored one comes back to
 *   archived    archived_at is not null         out of the working catalogue
 *                                               entirely, kept for good
 *   deleted     deleted_at is not null          in the bin
 *
 * A timestamp rather than a boolean, matching `deleted_at` beside it: "when"
 * is free to store and answers a question a boolean cannot — a merchant
 * looking at a list of two hundred archived products wants to know what they
 * put away last season and what has been there for two years.
 *
 * Archiving also unlists, in the service, for the same reason destroy() does:
 * something out of the working catalogue must not still be for sale.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->timestamp('archived_at')->nullable()->after('is_active');

            // The catalogue list's default query is "not archived", on every
            // page load of the busiest screen in the panel.
            $table->index('archived_at');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropIndex(['archived_at']);
            $table->dropColumn('archived_at');
        });
    }
};
