<?php

declare(strict_types=1);

namespace Modules\Media\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Admin\Models\AdminUser;

/**
 * One folder in the image library.
 *
 * A folder holds no files. It holds a name and a place in the tree; the images
 * point at it. See the migration for why that matters — the short version is
 * that reorganising the library must never change a single URL on the live
 * shop.
 *
 * Every write that touches `parent_id`, `path` or `depth` goes through
 * FolderTree. Setting them from anywhere else is how a subtree ends up with a
 * `path` that disagrees with its `parent_id`, and nothing would notice until a
 * folder quietly stopped showing its own images.
 *
 * @property int         $id
 * @property int|null    $parent_id
 * @property string      $name
 * @property string|null $color
 * @property string      $path
 * @property int         $depth
 * @property int|null    $created_by
 */
class MediaFolder extends Model
{
    /**
     * Deepest allowed nesting, counting a top-level folder as 0.
     *
     * Six levels is past the point where a merchant can hold the tree in their
     * head, and the sidebar runs out of indent well before that. The cap is a
     * kindness, not a technical limit: an unbounded tree is how a library
     * becomes unnavigable one reasonable-looking subfolder at a time.
     */
    public const MAX_DEPTH = 5;

    /**
     * The palette. Tokens, not hexes — see the migration.
     *
     * Seven plus "no colour", because a picker with twenty swatches is a
     * decision nobody wants to make while they are trying to file a photo,
     * and because seven is comfortably more than the number of top-level
     * folders a shop this size will ever have.
     */
    public const COLORS = ['amber', 'rose', 'violet', 'sky', 'emerald', 'teal', 'slate'];

    protected $fillable = ['parent_id', 'name', 'color', 'path', 'depth', 'created_by'];

    protected function casts(): array
    {
        return [
            'parent_id' => 'integer',
            'depth'     => 'integer',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('name');
    }

    public function assets(): HasMany
    {
        return $this->hasMany(MediaAsset::class, 'folder_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(AdminUser::class, 'created_by');
    }

    /**
     * This folder and everything under it.
     *
     * The LIKE is anchored at the start and `path` is indexed, so this is a
     * range scan rather than a table walk. `path` always ends in a slash,
     * which is what stops "/1/" from matching "/12/".
     */
    public function scopeInSubtree(Builder $query, self $root): Builder
    {
        return $query->where('path', 'like', $root->path . '%');
    }

    /** True when $other is this folder or lives underneath it. */
    public function contains(self $other): bool
    {
        return str_starts_with($other->path, $this->path);
    }

    /**
     * @param  array<int, string>  $names  id => name, for building the trail
     *                                     without a query per ancestor
     * @return array<int, array{id:int,name:string}>
     */
    public function trail(array $names): array
    {
        return collect(explode('/', trim($this->path, '/')))
            ->filter()
            ->map(static fn (string $id): array => [
                'id'   => (int) $id,
                'name' => $names[(int) $id] ?? '…',
            ])
            ->values()
            ->all();
    }

    /** @return array<string, mixed> */
    public function toPanelArray(int $directCount = 0, int $deepCount = 0): array
    {
        return [
            'id'       => $this->id,
            'parentId' => $this->parent_id,
            'name'     => $this->name,
            'color'    => $this->color,
            'depth'    => $this->depth,
            // Direct is what the folder itself holds; deep includes every
            // subfolder. The panel shows direct, and uses deep to warn before
            // a delete — "this folder and 3 under it hold 62 images" is the
            // sentence that stops the mis-click.
            'images'   => $directCount,
            'imagesDeep' => $deepCount,
        ];
    }
}
