<?php

declare(strict_types=1);

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One status change on one order. Append-only: nothing updates these rows.
 *
 * @property string      $to_status
 * @property string|null $from_status
 */
class OrderStatusEvent extends Model
{
    protected $fillable = [
        'order_id', 'from_status', 'to_status',
        'actor_admin_id', 'actor_name', 'actor_type', 'note',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function toAdminArray(): array
    {
        return [
            'from'   => $this->from_status,
            'to'     => $this->to_status,
            // "System" rather than a blank when nobody was involved, so a gap
            // in the trail never looks like missing data.
            'actor'  => $this->actor_name ?? ucfirst($this->actor_type),
            'type'   => $this->actor_type,
            'note'   => $this->note,
            'at'     => $this->created_at?->toIso8601String(),
        ];
    }
}
