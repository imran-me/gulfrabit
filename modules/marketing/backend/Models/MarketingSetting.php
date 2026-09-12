<?php

declare(strict_types=1);

namespace Modules\Marketing\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One marketing setting. See the migration for why this is not site_settings.
 *
 * Read and written only through Services\MetaPixelSettings, which owns the
 * rules about what a row means — reading this model directly skips the
 * fallback to .env and the handling of a row that no longer decrypts.
 *
 * @property string $key
 * @property array|null $value
 * @property string|null $updated_by
 */
class MarketingSetting extends Model
{
    protected $table = 'marketing_settings';
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['key', 'value', 'updated_by'];

    /**
     * Encrypted at rest and hidden from serialisation, like a courier's
     * credentials: the value holds the Conversions API token, and a model that
     * ends up in a JSON response or a log line must not carry it there.
     */
    protected $casts = ['value' => 'encrypted:array'];

    protected $hidden = ['value'];
}
