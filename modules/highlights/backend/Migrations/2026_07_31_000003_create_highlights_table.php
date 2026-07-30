<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which products appear on the home page, on which shelf, in what order.
 *
 * WHY NOT JUST USE THE `tags` COLUMN, which already has 'premium' and 'new':
 *
 *  - **Order.** A tag is a set. The home page shows six products in a row and
 *    the first one gets looked at most; "which six, and which is first" is a
 *    merchandising decision, and a JSON array of tags cannot express it.
 *  - **Meaning.** `tags` is also a search and filter facet. Overloading it with
 *    "and it decides the home page" means you cannot tag something premium
 *    without putting it on the front page.
 *  - **Emptiness.** A tag-driven rail silently shows whatever happens to carry
 *    the tag. This table lets a rail be deliberately empty, and lets the panel
 *    say "this shelf has nothing on it" rather than the home page quietly
 *    rendering a blank strip.
 *
 * The rail key is a plain string, not an enum: adding a shelf to the home page
 * should not need a migration. The set the panel offers is a constant in
 * `Highlight::RAILS`, and a row whose rail is no longer in that list is
 * ignored rather than breaking anything — which is what should happen when a
 * shelf is retired from the design.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('highlights', function (Blueprint $table): void {
            $table->id();

            $table->string('rail', 32);

            $table->foreignId('product_id')->constrained()->cascadeOnDelete();

            // Low first. Gaps are fine and expected — reordering rewrites the
            // whole rail anyway, and insisting on 0,1,2,3 would mean a second
            // pass on every move for no benefit.
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            // A product cannot be on the same shelf twice. It CAN be on two
            // different shelves, which is deliberate — a new arrival can also
            // be a premium pick.
            $table->unique(['rail', 'product_id']);
            $table->index(['rail', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('highlights');
    }
};
