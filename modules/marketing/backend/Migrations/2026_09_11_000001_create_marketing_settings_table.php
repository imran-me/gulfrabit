<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The marketing module's own settings — today, the three Meta keys from
 * Admin → Pixel setup.
 *
 * WHY NOT site_settings
 * ---------------------
 * modules/theme already has a key/value table, and this is the same shape. It
 * is not the same contract: site_settings is read by a PUBLIC endpoint and its
 * migration promises that nothing in it is secret. A Conversions API token is
 * the definition of a secret — it lets anyone send events into the shop's ad
 * account under its name — so it lives in a table whose only reader is this
 * module, behind the admin session.
 *
 * WHY `value` IS TEXT, NOT JSON
 * -----------------------------
 * The model casts it `encrypted:array`: what reaches the database is
 * ciphertext, which is not JSON, and MySQL refuses a non-JSON string in a
 * json column. A database dump — the usual way credentials leak — therefore
 * carries nothing usable without the APP_KEY.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_settings', function (Blueprint $table): void {
            // The key IS the primary key: one row per setting, looked up by
            // name, and a second identity would let two rows claim the same one.
            $table->string('key', 64)->primary();
            $table->text('value');
            // Who last saved it. Not an audit log — enough to answer "why is
            // the pixel different today, and who do I ask".
            $table->string('updated_by', 120)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_settings');
    }
};
