<?php

declare(strict_types=1);

namespace Modules\Checkout\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

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

    /* Deleting an order takes it off every screen and out of every count; it
       does not destroy it. Stock movements and journal entries reference this
       row, and the order number is on a packing slip in somebody's hand — see
       the migration for the full reasoning. Restored from the panel's Deleted
       tab with its items, its timeline and its refunds intact. */
    use SoftDeletes;

    /** Statuses a customer can still cancel from. */
    public const CANCELLABLE = ['placed', 'confirmed'];

    /**
     * Is this order waiting on a shipment rather than on us?
     *
     * The distinction the warehouse needs: an order sitting in `confirmed` for
     * a fortnight is normally a failure, and for a pre-order it is the plan.
     * Without this the two are indistinguishable on the board and the genuinely
     * stuck orders get lost among the ones that are merely early.
     */
    public function isPreorder(): bool
    {
        return $this->preorder_ships_on !== null;
    }

    /** Has the stock it was waiting for arrived? */
    public function preorderDue(): bool
    {
        return $this->preorder_ships_on !== null
            && ! $this->preorder_ships_on->isFuture();
    }

    protected $fillable = [
        'order_number', 'placement_ref', 'user_id',
        'customer_name', 'customer_phone', 'customer_email',
        'address_line', 'area', 'district_name', 'district_key', 'delivery_notes',
        'delivery_zone_key', 'delivery_eta', 'delivery_charge_poisha',
        'preorder_ships_on',
        'subtotal_poisha', 'discount_poisha', 'total_poisha', 'promo_code',
        'payment_method', 'payment_status', 'payment_reference',
        'status', 'placed_at',
        'ad_source', 'pixel_event_id',
    ];

    protected function casts(): array
    {
        return [
            'placed_at'              => 'datetime',
            'deleted_at'             => 'datetime',
            'preorder_ships_on'      => 'date',
            'subtotal_poisha'        => 'integer',
            'discount_poisha'        => 'integer',
            'delivery_charge_poisha' => 'integer',
            'total_poisha'           => 'integer',
            'ad_source'              => 'array',
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

            /* Pre-order. Null on an ordinary order, which is almost all of
               them — the confirmation and tracking screens branch on it rather
               than showing an empty "ships on" row to everybody. */
            'shipsOn'   => $this->preorder_ships_on?->toDateString(),
            // The sibling written in the same checkout, if the basket was
            // split. The confirmation screen needs it to say "and a second
            // parcel follows" rather than leaving a customer to discover a
            // second order number in a text message.
            'alsoOrdered' => $this->placement_ref === null ? null : self::query()
                ->where('placement_ref', $this->placement_ref)
                ->where('id', '!=', $this->id)
                ->get()
                ->map(fn (self $o): array => [
                    'id'      => $o->order_number,
                    'shipsOn' => $o->preorder_ships_on?->toDateString(),
                    'total'   => intdiv($o->total_poisha, 100),
                ])->all(),
        ];
    }
}
