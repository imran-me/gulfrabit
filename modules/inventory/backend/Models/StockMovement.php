<?php

declare(strict_types=1);

namespace Modules\Inventory\Models;

use Illuminate\Database\Eloquent\Model;

/** One change in stock. Append-only — nothing updates these rows. */
class StockMovement extends Model
{
    protected $fillable = [
        'product_id', 'warehouse_id', 'qty_delta', 'reason', 'unit_cost_poisha',
        'source_type', 'source_id', 'note', 'actor_admin_id', 'actor_name',
    ];

    protected $casts = [
        'qty_delta'        => 'integer',
        'unit_cost_poisha' => 'integer',
    ];

    public function toAdminArray(): array
    {
        return [
            'qty'      => $this->qty_delta,
            'reason'   => $this->reason,
            'unitCostTaka' => $this->unit_cost_poisha === null
                ? null
                : round($this->unit_cost_poisha / 100, 2),
            'note'     => $this->note,
            // "System" when an order caused it, a name when a person did.
            'actor'    => $this->actor_name ?? ($this->source_type ? 'System' : null),
            'source'   => $this->source_type,
            'at'       => $this->created_at?->toIso8601String(),
        ];
    }
}
