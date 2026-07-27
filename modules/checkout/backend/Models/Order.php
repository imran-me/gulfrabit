<?php

declare(strict_types=1);

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A placed order — a historical record, never a live view.
 *
 * @property string $order_number
 * @property int    $subtotal_poisha
 * @property int    $discount_poisha
 * @property int    $delivery_charge_poisha
 * @property int    $total_poisha
 */
class Order extends Model
{
    use HasFactory;

    /** Statuses a customer can still cancel from. */
    public const CANCELLABLE = ['placed', 'confirmed'];

    protected $fillable = [
        'order_number', 'user_id',
        'customer_name', 'customer_phone', 'customer_email',
        'address_line', 'area', 'district_name', 'district_key', 'delivery_notes',
        'delivery_zone_key', 'delivery_eta', 'delivery_charge_poisha',
        'subtotal_poisha', 'discount_poisha', 'total_poisha', 'promo_code',
        'payment_method', 'payment_status', 'payment_reference',
        'status', 'placed_at',
    ];

    protected function casts(): array
    {
        return [
            'placed_at'              => 'datetime',
            'subtotal_poisha'        => 'integer',
            'discount_poisha'        => 'integer',
            'delivery_charge_poisha' => 'integer',
            'total_poisha'           => 'integer',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'order_number';
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /** Oldest first — this is a story, and stories are read forwards. */
    public function statusEvents(): HasMany
    {
        return $this->hasMany(OrderStatusEvent::class)->oldest();
    }

    public function refunds(): HasMany
    {
        return $this->hasMany(OrderRefund::class)->oldest();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class);
    }

    public function scopeForPhone(Builder $q, string $phone): Builder
    {
        return $q->where('customer_phone', $phone);
    }

    public function isCancellable(): bool
    {
        return in_array($this->status, self::CANCELLABLE, true);
    }

    /**
     * The shape the storefront consumes — order confirmation, order history and
     * the tracking page all render from this.
     */
    public function toStorefrontArray(): array
    {
        return [
            'id'        => $this->order_number,
            'date'      => $this->placed_at?->toDateString(),
            'status'    => $this->status,
            'payment'   => $this->payment_method,
            'paymentStatus' => $this->payment_status,
            'delivery'  => $this->delivery_zone_key,
            'eta'       => $this->delivery_eta,
            'address'   => implode(', ', array_filter([
                $this->address_line, $this->area, $this->district_name,
            ])),
            'phone'     => $this->customer_phone,
            'promo'     => $this->promo_code,
            'totals'    => [
                'subtotal' => intdiv($this->subtotal_poisha, 100),
                'discount' => intdiv($this->discount_poisha, 100),
                'delivery' => intdiv($this->delivery_charge_poisha, 100),
                'total'    => intdiv($this->total_poisha, 100),
            ],
            // Kept for the existing frontend, which reads order.total directly.
            'total'     => intdiv($this->total_poisha, 100),
            'items'     => $this->items->map(fn (OrderItem $i) => $i->toStorefrontArray())->all(),
            'cancellable' => $this->isCancellable(),
        ];
    }
}
