<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An override for one piece of content on one page.
 *
 * OVERRIDE, NOT SOURCE
 * --------------------
 * The authored HTML remains the content. A row here says "wherever
 * data-cms="home.hero.title" appears, show this instead". Delete the row and
 * the page returns to what the developer wrote; delete the whole module and
 * every page still renders exactly as authored. That is what makes this safe to
 * hand to a non-technical editor: the worst outcome is wrong words, never a
 * broken page.
 *
 * TWO TYPES ONLY
 * --------------
 * `text` and `image`. There is no `html` type, and adding one would undo both
 * guarantees at once: the storefront writes text via textContent and images via
 * a validated src, so stored markup could never execute — which is the same
 * rule as "editors change content, not layout". The safety property and the
 * product constraint are the same constraint, which is why neither is
 * negotiable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_blocks', function (Blueprint $table): void {
            $table->id();

            // Dotted and stable: page.section.field. It is written into the
            // markup, so renaming one is a code change — which is correct,
            // because a key that drifts silently orphans its content.
            $table->string('key', 120)->unique();
            $table->string('page', 60)->index();

            $table->enum('type', ['text', 'image']);
            $table->text('value');

            // For images: the alt text, which is content and must be editable
            // alongside the picture rather than being lost when it changes.
            $table->string('alt')->nullable();

            $table->unsignedBigInteger('updated_by_admin_id')->nullable();
            $table->string('updated_by_name')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_blocks');
    }
};
