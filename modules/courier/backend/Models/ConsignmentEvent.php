<?php

declare(strict_types=1);

namespace Modules\Courier\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One scan on one consignment. Append-only. */
class ConsignmentEvent extends Model
{
    protected $fillable = [
        'consignment_id', 'status', 'description', 'location',
        'source', 'actor_name', 'external_id', 'occurred_at',
    ];

    protected function casts(): array
    {
        return ['occurred_at' => 'datetime'];
    }

    public function consignment(): BelongsTo
    {
        return $this->belongsTo(Consignment::class);
    }

    public function toAdminArray(): array
    {
        return [
            'status'      => $this->status,
            'description' => $this->description,
            'location'    => $this->location,
            // Says whether a courier scanned this or a person typed it. On a
            // manual consignment every line is staff-entered, and the trail
            // should not imply a carrier confirmed anything.
            'source'      => $this->source,
            'actor'       => $this->actor_name,
            'at'          => $this->occurred_at?->toIso8601String(),
        ];
    }
}
