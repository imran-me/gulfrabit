<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A deleted banner can be put back.
 *
 * The old dialog said it plainly — "switching it off keeps it for later;
 * deleting does not" — which was honest and was also an admission that the
 * only safe delete on this screen was the one nobody wanted. A banner is a
 * headline, a sub-line, a button label, a link and an image that somebody
 * chose and cropped. Losing that to one mis-click means rebuilding it from
 * memory, and the copy is never quite the same twice.
 *
 * Now it keeps it too, and the difference between the switch and the delete
 * becomes the honest one: off means "not now", deleted means "not part of the
 * rotation at all" — and both are reversible.
 *
 * `sort_order` is left untouched on the way out. A restored banner returns to
 * the place it held rather than to the end of the carousel, which is where a
 * re-created one would have to start.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hero_slides', function (Blueprint $table): void {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('hero_slides', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });
    }
};
