<?php

declare(strict_types=1);

namespace Modules\Account\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Delivery\Models\District;

/**
 * A saved delivery address.
 *
 * @property string $label
 * @property string $recipient_name
 * @property bool   $is_default
 */
class Address extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'label', 'recipient_name', 'recipient_phone',
        'line1', 'area', 'district_id', 'notes', 'is_default',
    ];

    protected function casts(): array
    {
        return ['is_default' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class);
    }

    public function district(): BelongsTo
    {
        return $this->belongsTo(District::class);
    }

    /** Default first, then newest — the order the account page renders. */
    public function scopeOrdered(Builder $q): Builder
    {
        return $q->orderByDesc('is_default')->orderByDesc('id');
    }

    /**
     * The shape the storefront consumes.
     *
     * Includes the district KEY as well as its name, because checkout needs the
     * key to re-quote delivery — an address the customer cannot actually check
     * out with is decoration.
     */
    public function toStorefrontArray(): array
    {
        return [
            'id'           => $this->id,
            'label'        => $this->label,
            'name'         => $this->recipient_name,
            'phone'        => $this->recipient_phone,
            'line1'        => $this->line1,
            'area'         => $this->area,
            'districtKey'  => $this->district?->key,
            'districtName' => $this->district?->name,
            'notes'        => $this->notes,
            'isDefault'    => $this->is_default,
        ];
    }
}
