<?php

declare(strict_types=1);

namespace Modules\B2b\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A request for quote — a lead, not an order.
 *
 * @property string $reference
 * @property int    $indicative_total_poisha
 */
class QuoteRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'reference', 'user_id', 'company', 'contact_name', 'contact_phone',
        'contact_email', 'notes', 'indicative_total_poisha', 'status', 'responded_at',
    ];

    protected function casts(): array
    {
        return [
            'responded_at'            => 'datetime',
            'indicative_total_poisha' => 'integer',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'reference';
    }

    public function items(): HasMany
    {
        return $this->hasMany(QuoteRequestItem::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class);
    }

    public function scopeOpen(Builder $q): Builder
    {
        return $q->whereIn('status', ['new', 'reviewing']);
    }

    /**
     * What the submitter gets back.
     *
     * The indicative total is included but labelled as such by the endpoint —
     * it must never read as an agreed price.
     */
    public function toStorefrontArray(): array
    {
        return [
            'reference'       => $this->reference,
            'company'         => $this->company,
            'status'          => $this->status,
            'submittedAt'     => $this->created_at?->toIso8601String(),
            'indicativeTotal' => intdiv($this->indicative_total_poisha, 100),
            'items'           => $this->items->map(fn (QuoteRequestItem $i) => $i->toStorefrontArray())->all(),
        ];
    }
}
