<?php

declare(strict_types=1);

namespace Modules\Payments\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Checkout\Models\Order;

/**
 * One attempt to pay one order through one gateway.
 *
 * An order can legitimately have several of these — the customer cancels
 * inside bKash, tries again, gives up and takes COD. That history is worth
 * keeping: "the customer tried to pay twice and the gateway refused" is a
 * support conversation this table can settle and the orders table cannot.
 *
 *   initiated → completed | failed | cancelled
 *
 * Only `completed` ever marks the order paid, and only PaymentService may do
 * that — see the class comment there.
 */
class Payment extends Model
{
    protected $fillable = [
        'order_id', 'gateway', 'amount_poisha', 'status',
        'gateway_ref', 'trx_id', 'response',
    ];

    protected function casts(): array
    {
        return [
            'amount_poisha' => 'integer',
            'response'      => 'array',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
