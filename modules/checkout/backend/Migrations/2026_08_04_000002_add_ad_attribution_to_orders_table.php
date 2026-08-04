<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which ad sold this order.
 *
 * The shop's whole acquisition model is paid social: an ad names a product,
 * the click lands on the express checkout, the order is placed. Without these
 * two columns the money flows one way and the knowledge the other — Meta knows
 * which campaign spent, the panel knows which orders exist, and nobody can put
 * the two side by side.
 *
 *   ad_source        the UTM set captured on the visitor's FIRST touch
 *                    (utm_source/medium/campaign/content/term, fbclid, landing
 *                    path and time), as JSON. Null = organic. Written once at
 *                    placement, never updated — it is a record of an event.
 *   pixel_event_id   the event_id the browser used for its Purchase pixel
 *                    event. The Conversions API forwarder must reuse it, or
 *                    Meta counts every sale twice. See shared/js/core/analytics.js.
 *
 * Neither field is money and neither is trusted for anything but reporting —
 * the client-proposes-no-figures rule of this module is untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->json('ad_source')->nullable()->after('payment_reference')
                ->comment('First-touch UTM set, null = organic');
            $table->string('pixel_event_id', 64)->nullable()->after('ad_source')
                ->comment('Browser Purchase event id — CAPI must reuse it to dedupe');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn(['ad_source', 'pixel_event_id']);
        });
    }
};
