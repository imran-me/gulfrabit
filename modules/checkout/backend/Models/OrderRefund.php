<?php

declare(strict_types=1);

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Money returned to a customer. Append-only, like the status events: a refund
 * that was wrong is corrected by recording another movement, never by editing
 * the first one out of existence.
 *
 * @property int $amount_poisha
 */
class OrderRefund extends Model
{
    protected $fillable = [
        'order_id', 'amount_poisha', 'method', 'reference', 'reason',
        'authorised_by_admin_id', 'authorised_by_name',
    ];

    protected function casts(): array
    {
        return ['amount_poisha' => 'integer'];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function toAdminArray(): array
    {
        return [
            'id'         => $this->id,
            'amountTaka' => intdiv($this->amount_poisha, 100),
            'method'     => $this->method,
            'reference'  => $this->reference,
            'reason'     => $this->reason,
            'by'         => $this->authorised_by_name,
            'at'         => $this->created_at?->toIso8601String(),
        ];
    }
}
