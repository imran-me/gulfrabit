<?php

declare(strict_types=1);

namespace Modules\Courier\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One handover of one order to one courier.
 *
 * @property int  $cost_poisha
 * @property int  $cod_amount_poisha
 */
class Consignment extends Model
{
    protected $fillable = [
        'order_id', 'courier_id', 'tracking_number', 'consignment_ref', 'status',
        'cost_poisha', 'cod_amount_poisha', 'cod_remitted',
        'assigned_by_admin_id', 'assigned_by_name', 'handed_over_at', 'note',
    ];

    protected function casts(): array
    {
        return [
            'cost_poisha'       => 'integer',
            'cod_amount_poisha' => 'integer',
            'cod_remitted'      => 'boolean',
            'handed_over_at'    => 'datetime',
        ];
    }

    public function courier(): BelongsTo
    {
        return $this->belongsTo(Courier::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(ConsignmentEvent::class)->orderBy('occurred_at');
    }

    /** Statuses from which nothing more will happen. */
    public function isClosed(): bool
    {
        return in_array($this->status, ['delivered', 'returned', 'cancelled'], true);
    }

    public function toAdminArray(): array
    {
        return [
            'id'             => $this->id,
            'courier'        => $this->courier?->name,
            'courierKey'     => $this->courier?->key,
            'trackingNumber' => $this->tracking_number,
            'trackingUrl'    => $this->courier?->trackingUrl($this->tracking_number),
            'status'         => $this->status,
            'costTaka'       => $this->cost_poisha === null ? null : intdiv($this->cost_poisha, 100),
            'codTaka'        => intdiv($this->cod_amount_poisha, 100),
            'codRemitted'    => $this->cod_remitted,
            'assignedBy'     => $this->assigned_by_name,
            'handedOverAt'   => $this->handed_over_at?->toIso8601String(),
            'note'           => $this->note,
            'events'         => $this->relationLoaded('events')
                ? $this->events->map->toAdminArray()->all()
                : [],
        ];
    }
}
