<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every change to a staff account, with who made it.
 *
 * WHY THIS IS WORTH A TABLE
 * -------------------------
 * Granting access is the most consequential thing anybody does in this panel,
 * and until this table it was the only consequential thing that left no trace.
 * A price change is logged. An order moving stage is logged, with the name of
 * the person who moved it. A customer erasure is logged. But "who made Rahim
 * an owner, and when?" had no answer at all — and that is the one question
 * that matters after something goes wrong, because the answer to every other
 * question depends on knowing who could have done it.
 *
 * NEITHER ID IS A FOREIGN KEY
 * ---------------------------
 * `product_price_changes` constrains its subject and leaves its actor loose.
 * This does neither, on purpose.
 *
 * Staff accounts are never deleted — there is no DELETE route and no
 * `deleted_at` column — so a constraint would buy integrity this table can
 * already rely on. What it would also buy is `cascadeOnDelete`, and the moment
 * somebody removes an admin row by hand is precisely the moment this log stops
 * being optional. An accountability record that is erased by the act it exists
 * to record is not a record.
 *
 * Both names are denormalised beside their ids for the same reason: the log has
 * to stay readable after a rename, and "admin #4 changed admin #7" is not an
 * answer anybody can act on months later.
 *
 * Append-only. There is no edit and no delete, like the order timeline and the
 * customer notes — a trail that can be tidied up after an argument settles
 * nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_user_events', function (Blueprint $table): void {
            $table->id();

            // Who this happened TO.
            $table->unsignedBigInteger('admin_user_id');
            $table->string('subject_name');

            // created | role_changed | details_changed | disabled | enabled
            // | password_reset | password_changed | unlocked
            $table->string('action', 24);

            // What moved, where the action has a before and an after — the role
            // for role_changed, the email for details_changed. Null on both
            // sides for the actions that are simply an event: unlocked, enabled,
            // a password reset. Nullable rather than empty strings, so "there
            // was no previous value" and "the previous value was blank" stay
            // different facts.
            $table->string('from_value')->nullable();
            $table->string('to_value')->nullable();

            // Who did it. Equal to admin_user_id when somebody changes their own
            // password, which is the one action on this list a non-owner can
            // cause — see AdminAuthController::changePassword.
            $table->unsignedBigInteger('actor_admin_id');
            $table->string('actor_name');

            $table->timestamps();

            // The two ways this gets read: one account's history, and the
            // panel-wide recent list on the Staff screen.
            $table->index(['admin_user_id', 'created_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_user_events');
    }
};
