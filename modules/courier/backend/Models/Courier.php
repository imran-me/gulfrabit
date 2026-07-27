<?php

declare(strict_types=1);

namespace Modules\Courier\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A carrier we can hand parcels to.
 *
 * @property string $key
 * @property string $driver
 */
class Courier extends Model
{
    protected $fillable = [
        'key', 'name', 'driver', 'tracking_url_template', 'support_phone',
        'credentials', 'is_active', 'is_configured', 'sort_order',
    ];

    /**
     * Credentials are encrypted at rest and hidden from serialisation.
     *
     * A courier API key can create shipments billed to this account, so it is
     * a secret, not configuration. `encrypted:array` means a database dump — the
     * most common way these leak — carries ciphertext.
     */
    protected $casts = [
        'credentials'   => 'encrypted:array',
        'is_active'     => 'boolean',
        'is_configured' => 'boolean',
        'sort_order'    => 'integer',
    ];

    protected $hidden = ['credentials'];

    public function getRouteKeyName(): string
    {
        return 'key';
    }

    public function scopeUsable(Builder $q): Builder
    {
        return $q->where('is_active', true)->orderBy('sort_order');
    }

    /** The customer-facing tracking link, or null when the courier has none. */
    public function trackingUrl(?string $trackingNumber): ?string
    {
        if (! $trackingNumber || ! $this->tracking_url_template) {
            return null;
        }

        return str_replace('{tracking}', rawurlencode($trackingNumber), $this->tracking_url_template);
    }

    public function toAdminArray(): array
    {
        return [
            'key'          => $this->key,
            'name'         => $this->name,
            'driver'       => $this->driver,
            'isActive'     => $this->is_active,
            // Reported separately so the panel can say "switched on but not
            // connected" instead of silently offering something that will fail.
            'isConfigured' => $this->is_configured,
            'supportPhone' => $this->support_phone,
        ];
    }
}
