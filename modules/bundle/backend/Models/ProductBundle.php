<?php

declare(strict_types=1);

namespace Modules\Bundle\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A merchant-curated pairing: a title, the reason it holds together, and an
 * ordered list of product SKUs.
 *
 * @property string $key
 * @property string $title
 * @property string $reason
 * @property array<int, string> $members
 */
class ProductBundle extends Model
{
    protected $fillable = [
        'key',
        'title',
        'reason',
        'members',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'members'    => 'array',
        'sort_order' => 'integer',
        'is_active'  => 'boolean',
    ];

    public function getRouteKeyName(): string
    {
        return 'key';
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('is_active', true)->orderBy('sort_order');
    }

    /* No `whereJsonContains` scope on purpose. The table holds tens of rows,
       and JSON containment is the one clause MySQL, MariaDB and SQLite disagree
       on sharply enough that a query working on the developer's machine fails
       on the host. BundleService loads the active set and filters with
       contains() below — same result, no dialect risk. */

    /** @return array<int, string> */
    public function memberSkus(): array
    {
        return array_values(array_filter((array) $this->members, 'is_string'));
    }

    public function contains(string $sku): bool
    {
        return in_array($sku, $this->memberSkus(), true);
    }
}
