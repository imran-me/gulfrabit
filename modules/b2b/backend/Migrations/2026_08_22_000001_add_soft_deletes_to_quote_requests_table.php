<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A quote request can be taken out of the inbox.
 *
 * Submitting an RFQ is public and unauthenticated — that is deliberate, since
 * procurement staff routinely ask before anyone creates an account, and
 * forcing a signup loses the lead. The cost of that decision is spam, and
 * until now the desk had nowhere to put it: a junk request sat in the inbox
 * forever, or was marked `lost`, which is the status for a real lead that went
 * to a competitor and is a number somebody reports on.
 *
 * Soft, for the same reason as everywhere else in the panel, plus one specific
 * to this table: quote_request_items hang off it, and those lines are the
 * whole content of the request. A hard delete would take a genuine enquiry's
 * fourteen line items with it on the day somebody misreads a company name.
 *
 * `reference` is what the customer was given and what they quote back on the
 * phone. It stays resolvable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quote_requests', function (Blueprint $table): void {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('quote_requests', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });
    }
};
