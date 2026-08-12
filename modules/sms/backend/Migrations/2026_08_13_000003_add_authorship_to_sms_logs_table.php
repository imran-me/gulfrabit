<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who sent this SMS, and whether a person chose to.
 *
 * Until now every message in this table was written by the same author — the
 * status listener — so there was nothing to record. Staff can now type a
 * message to a customer from the order screen, and the moment a human can send
 * one, "who sent this and why" becomes the first question anybody asks about a
 * message a customer disputes.
 *
 * `kind` is not derivable from `sent_by_name` being null. A future automated
 * campaign would also have no author, and lumping it in with the transactional
 * status alerts would make the one honest count in this table — how many
 * messages we actually chose to send this person — unrecoverable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sms_logs', function (Blueprint $table): void {
            // Null for anything the system sent on its own. Not a foreign key
            // to admin_users, for the same reason the refund trail stores a
            // name: the record must still read correctly if the account is
            // later disabled or renamed.
            $table->string('sent_by_name')->nullable()->after('gateway');

            $table->string('kind', 16)->default('automatic')
                ->after('sent_by_name')
                ->comment('automatic — a status alert | manual — typed by staff');
        });
    }

    public function down(): void
    {
        Schema::table('sms_logs', function (Blueprint $table): void {
            $table->dropColumn(['sent_by_name', 'kind']);
        });
    }
};
