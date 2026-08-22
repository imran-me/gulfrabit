<?php

declare(strict_types=1);

namespace Modules\Media\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Admin\Models\AdminUser;

/**
 * One image in the library.
 *
 * @property int         $id
 * @property string      $hash
 * @property string      $path
 * @property string      $original_name
 * @property string      $mime
 * @property int         $bytes
 * @property int|null    $width
 * @property int|null    $height
 * @property string|null $alt
 * @property int         $usage_count
 */
class MediaAsset extends Model
{
    protected $fillable = [
        'hash', 'path', 'folder_id', 'original_name', 'mime',
        'bytes', 'width', 'height', 'alt', 'uploaded_by',
    ];

    protected function casts(): array
    {
        return [
            'bytes'       => 'integer',
            'width'       => 'integer',
            'height'      => 'integer',
            'usage_count' => 'integer',
            'folder_id'   => 'integer',
        ];
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(AdminUser::class, 'uploaded_by');
    }

    /**
     * The folder this image is filed under, or none for the top level.
     *
     * Filing only. `path` — the URL the shop serves — does not contain the
     * folder and never will: moving an image between folders must not change
     * where the browser fetches it from, or reorganising the library would
     * blank out pictures on the live site.
     */
    public function folder(): BelongsTo
    {
        return $this->belongsTo(MediaFolder::class, 'folder_id');
    }

    /**
     * usage_count is ADVISORY.
     *
     * It exists so the panel can warn "this image is used on 3 products"
     * before a delete. It is deliberately not a foreign-key count: the
     * consumers store a path string, not a relation, precisely so that media
     * can be deleted as a module without breaking catalog rows. The cost is
     * that the count can drift — hence the floor at zero rather than an
     * assertion, and hence the panel warns rather than refuses.
     */
    public function attach(): void
    {
        $this->increment('usage_count');
    }

    public function detach(): void
    {
        if ($this->usage_count > 0) {
            $this->decrement('usage_count');
        }
    }

    /** @return array<string, mixed> */
    public function toPanelArray(): array
    {
        return [
            'id'        => $this->id,
            'url'       => $this->path,
            'folderId'  => $this->folder_id,
            'name'      => $this->original_name,
            'alt'       => $this->alt,
            'width'     => $this->width,
            'height'    => $this->height,
            'bytes'     => $this->bytes,
            'usedBy'    => $this->usage_count,
            'uploaded'  => $this->created_at?->toIso8601String(),
        ];
    }
}
