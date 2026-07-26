<?php

declare(strict_types=1);

namespace Modules\Delivery\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Builder;

/**
 * A delivery service area and what it costs.
 *
 * @property int    $id
 * @property string $key
 * @property string $label
 * @property string $eta_text
 * @property int    $charge_poisha
 * @property bool   $is_active
 * @property int    $sort_order
 */
class DeliveryZone extends Model
{
    use HasFactory;

    protected $fillable = [
        'key',
        'label',
        'eta_text',
        'charge_poisha',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'charge_poisha' => 'integer',
            'is_active'     => 'boolean',
            'sort_order'    => 'integer',
        ];
    }

    public function districts(): HasMany
    {
        return $this->hasMany(District::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order');
    }

    /**
     * Charge in whole taka. Money is stored in poisha so it can never pick up
     * float error; taka is only ever a presentation concern.
     */
    public function chargeTaka(): int
    {
        return intdiv($this->charge_poisha, 100);
    }

    /**
     * The shape the storefront consumes. Kept here so the controller stays thin
     * and every caller returns an identical contract.
     *
     * @return array{id:string,label:string,eta:string,cost:int}
     */
    public function toQuote(): array
    {
        return [
            'id'    => $this->key,
            'label' => $this->label,
            'eta'   => $this->eta_text,
            'cost'  => $this->chargeTaka(),
        ];
    }
}
