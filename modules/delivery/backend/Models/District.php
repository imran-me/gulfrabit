<?php

declare(strict_types=1);

namespace Modules\Delivery\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One of the 64 districts of Bangladesh, and the zone that prices it.
 *
 * @property int    $id
 * @property string $key
 * @property string $name
 * @property string $division
 * @property int    $delivery_zone_id
 */
class District extends Model
{
    use HasFactory;

    protected $fillable = [
        'key',
        'name',
        'division',
        'delivery_zone_id',
    ];

    public function zone(): BelongsTo
    {
        return $this->belongsTo(DeliveryZone::class, 'delivery_zone_id');
    }

    /** Route-model binding and lookups use the public slug, never the id. */
    public function getRouteKeyName(): string
    {
        return 'key';
    }
}
