<?php

declare(strict_types=1);

namespace Modules\Cms\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** What a block said before an edit. Append-only. */
class ContentRevision extends Model
{
    protected $fillable = [
        'content_block_id', 'value', 'alt',
        'changed_by_admin_id', 'changed_by_name',
    ];

    public function block(): BelongsTo
    {
        return $this->belongsTo(ContentBlock::class, 'content_block_id');
    }

    public function toAdminArray(): array
    {
        return [
            'id'    => $this->id,
            'value' => $this->value,
            'alt'   => $this->alt,
            'by'    => $this->changed_by_name,
            'at'    => $this->created_at?->toIso8601String(),
        ];
    }
}
