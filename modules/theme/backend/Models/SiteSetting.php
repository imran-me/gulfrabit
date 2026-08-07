<?php

declare(strict_types=1);

namespace Modules\Theme\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One shop-wide setting. See the migration for why this table is general.
 */
class SiteSetting extends Model
{
    protected $table = 'site_settings';
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['key', 'value', 'updated_by'];

    protected $casts = ['value' => 'array'];

    /** The storefront theme. The only setting this module owns. */
    public const THEME_KEY = 'storefront_theme';

    /**
     * The themes that exist. Anything not in here is not a theme, and the
     * controller refuses it rather than storing a string that would reach an
     * HTML attribute unvalidated.
     */
    public const THEMES = ['classic', 'luxe', 'trio'];

    public const DEFAULT_THEME = 'classic';
}
