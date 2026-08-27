<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-account permissions, on top of the role.
 *
 * WHAT CHANGED, AND WHY THE ROLE STAYS
 * ------------------------------------
 * The original table note argued for one role per user and against a
 * permission matrix, on the grounds that a matrix nobody maintains drifts until
 * everyone is an owner. That risk is real and this does not pretend otherwise
 * — but "give this one person the orders screen and nothing else" is an
 * ordinary thing for a shop to want, and five fixed roles cannot express it.
 *
 * So the role does not go away and is not replaced. It becomes a PRESET: it
 * fills in a sensible set of permissions, and an owner may then tick or untick
 * individual ones for that person. The matrix is opt-in, per account, and the
 * five roles still cover everybody who does not need anything special.
 *
 * NULL IS NOT AN EMPTY LIST
 * -------------------------
 * Nullable, and null means "follow the role" rather than "has no permissions".
 * That distinction is the entire backwards-compatibility story: every account
 * that exists when this migration runs keeps null, keeps following its role,
 * and behaves exactly as it did the day before. Defaulting to an empty array
 * instead would have locked every existing staff member out of the panel the
 * moment this deployed.
 *
 * Once an owner customises an account the column holds the FULL effective list,
 * not a diff against the role. A diff has to be re-resolved against a preset
 * that may change underneath it in a later release, and "your permissions moved
 * because we edited a role you were not using" is not a surprise anybody should
 * get from an upgrade.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admin_users', function (Blueprint $table): void {
            // json rather than a joined table: this panel holds five to twenty
            // staff accounts and the list is read whole on every request and
            // written whole from one form. A row per grant would be the right
            // call at a thousand users and is bookkeeping at twenty.
            $table->json('permissions')->nullable()->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('admin_users', function (Blueprint $table): void {
            $table->dropColumn('permissions');
        });
    }
};
