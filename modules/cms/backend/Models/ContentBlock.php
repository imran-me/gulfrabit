<?php

declare(strict_types=1);

namespace Modules\Cms\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One content override.
 *
 * @property string $key
 * @property string $type
 */
class ContentBlock extends Model
{
    protected $fillable = [
        'key', 'page', 'type', 'value', 'alt',
        'updated_by_admin_id', 'updated_by_name',
    ];

    public function getRouteKeyName(): string
    {
        return 'key';
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(ContentRevision::class)->latest();
    }

    public function toAdminArray(): array
    {
        return [
            'key'   => $this->key,
            'page'  => $this->page,
            'type'  => $this->type,
            'value' => $this->value,
            'alt'   => $this->alt,
            'by'    => $this->updated_by_name,
            'at'    => $this->updated_at?->toIso8601String(),
        ];
    }
}
