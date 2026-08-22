<?php

declare(strict_types=1);

namespace Modules\Media\Services;

use Illuminate\Support\Facades\DB;
use Modules\Media\Models\MediaAsset;
use Modules\Media\Models\MediaFolder;
use RuntimeException;

/**
 * Every write to the folder tree, in one place.
 *
 * WHY A SERVICE AND NOT FOUR CONTROLLER METHODS. Three columns have to agree
 * with each other on every write — `parent_id`, `path` and `depth` — and two
 * of them describe the same fact twice. A move that updates the row but not
 * its subtree leaves grandchildren whose `path` says one thing and whose
 * `parent_id` says another, and nothing complains: the folder simply stops
 * showing some of its images, weeks later, to someone who did not make the
 * move. So there is exactly one place that may write those columns.
 *
 * Every refusal in here throws RuntimeException with a sentence written for
 * the merchant, which the controller turns into a 422. None of them are
 * assertions about our own code — they are all things a person can genuinely
 * try to do, and each deserves an answer rather than a stack trace.
 */
class FolderTree
{
    /**
     * The whole tree, in one query, ordered so a parent always precedes its
     * children.
     *
     * The whole tree, not a page of it: folders are tens, not thousands, and
     * a sidebar that pages is not a sidebar. Ordering by `path` is what makes
     * the client's job a single pass — every row's parent has already been
     * seen by the time the row arrives.
     *
     * @return array<int, array<string, mixed>>
     */
    public function tree(): array
    {
        $folders = MediaFolder::query()->orderBy('path')->get();

        // One grouped count, not a count per folder. The naive version is a
        // query per row, which on a fifty-folder library is fifty round trips
        // to paint a sidebar.
        $direct = MediaAsset::query()
            ->whereNotNull('folder_id')
            ->selectRaw('folder_id, count(*) as total')
            ->groupBy('folder_id')
            ->pluck('total', 'folder_id');

        $deep = [];

        foreach ($folders as $folder) {
            // Walk the ancestry out of the materialised path and add this
            // folder's own count to every ancestor, itself included. One pass,
            // no queries.
            $own = (int) ($direct[$folder->id] ?? 0);

            foreach (explode('/', trim($folder->path, '/')) as $ancestor) {
                if ($ancestor === '') {
                    continue;
                }

                $deep[(int) $ancestor] = ($deep[(int) $ancestor] ?? 0) + $own;
            }
        }

        return $folders
            ->map(fn (MediaFolder $f): array => $f->toPanelArray(
                (int) ($direct[$f->id] ?? 0),
                (int) ($deep[$f->id] ?? 0),
            ))
            ->all();
    }

    /** Images filed at the top level — the "Unfiled" row in the sidebar. */
    public function unfiledCount(): int
    {
        return MediaAsset::query()->whereNull('folder_id')->count();
    }

    public function create(?MediaFolder $parent, string $name, ?int $by): MediaFolder
    {
        $name = $this->cleanName($name);
        $depth = $parent ? $parent->depth + 1 : 0;

        if ($depth > MediaFolder::MAX_DEPTH) {
            throw new RuntimeException(
                'Folders can only go ' . (MediaFolder::MAX_DEPTH + 1) . ' levels deep. Put this one higher up.'
            );
        }

        $this->refuseDuplicate($parent?->id, $name, null);

        return DB::transaction(function () use ($parent, $name, $depth, $by): MediaFolder {
            // `path` needs the id, and the id does not exist until the insert.
            // Saving twice inside a transaction is the honest way to do that;
            // the alternative is a client-generated key, which buys nothing
            // here and costs the readable ancestry the LIKE depends on.
            $folder = MediaFolder::create([
                'parent_id'  => $parent?->id,
                'name'       => $name,
                'path'       => 'pending',
                'depth'      => $depth,
                'created_by' => $by,
            ]);

            $folder->update(['path' => ($parent?->path ?? '/') . $folder->id . '/']);

            return $folder;
        });
    }

    public function rename(MediaFolder $folder, string $name): MediaFolder
    {
        $name = $this->cleanName($name);

        $this->refuseDuplicate($folder->parent_id, $name, $folder->id);

        // `path` is ids, so a rename touches nothing else. That is the whole
        // reason it is ids and not names.
        $folder->update(['name' => $name]);

        return $folder;
    }

    /**
     * Move a folder — and everything under it — somewhere else.
     *
     * $parent === null means the top level.
     */
    public function move(MediaFolder $folder, ?MediaFolder $parent): MediaFolder
    {
        if ($parent && $parent->id === $folder->id) {
            throw new RuntimeException('A folder cannot be put inside itself.');
        }

        // The cycle that actually happens: dragging a parent into its own
        // child. Without this the two rows point at each other and every
        // query that walks the tree runs forever.
        if ($parent && $folder->contains($parent)) {
            throw new RuntimeException(sprintf(
                '"%s" is inside "%s", so it cannot become its parent.',
                $parent->name,
                $folder->name
            ));
        }

        $newDepth = $parent ? $parent->depth + 1 : 0;
        $shift = $newDepth - $folder->depth;

        $subtree = MediaFolder::query()->inSubtree($folder)->get();
        $deepest = (int) $subtree->max('depth');

        if ($deepest + $shift > MediaFolder::MAX_DEPTH) {
            throw new RuntimeException(
                'That would nest folders too deep. Move the subfolders out first, or choose a shallower place.'
            );
        }

        $this->refuseDuplicate($parent?->id, $folder->name, $folder->id);

        return DB::transaction(function () use ($folder, $parent, $newDepth, $shift, $subtree): MediaFolder {
            $oldPath = $folder->path;
            $newPath = ($parent?->path ?? '/') . $folder->id . '/';

            foreach ($subtree as $node) {
                if ($node->id === $folder->id) {
                    continue;   // the mover itself is written once, below
                }

                // Prefix swap, not a rebuild: the ids under $folder do not
                // change, only what sits above them.
                $node->update([
                    'path'  => $newPath . substr($node->path, strlen($oldPath)),
                    'depth' => $node->depth + $shift,
                ]);
            }

            $folder->update([
                'parent_id' => $parent?->id,
                'depth'     => $newDepth,
                'path'      => $newPath,
            ]);

            return $folder;
        });
    }

    /**
     * Delete a folder. Never deletes an image.
     *
     * Refused while the folder holds anything, unless $force — and even then
     * the contents move up to the parent rather than going anywhere near a
     * delete. A folder is filing; an image is a picture on a live shop. One of
     * those is safe to throw away on a single click and the other is not, and
     * conflating them is how a merchant blanks out a catalogue by tidying up.
     */
    public function delete(MediaFolder $folder, bool $force): void
    {
        $children = MediaFolder::query()->where('parent_id', $folder->id)->count();
        $images = MediaAsset::query()->where('folder_id', $folder->id)->count();

        if (($children || $images) && ! $force) {
            throw new RuntimeException($this->occupiedMessage($folder, $children, $images));
        }

        DB::transaction(function () use ($folder): void {
            $parent = $folder->parent;

            // Children first, so the RESTRICT foreign key on parent_id is
            // never the thing that stops us — it is a backstop for mistakes,
            // not a workflow. move() rewrites their subtree paths, which is
            // the part a plain `update(parent_id)` would silently skip.
            foreach (MediaFolder::query()->where('parent_id', $folder->id)->get() as $child) {
                $this->move($child, $parent);
            }

            MediaAsset::query()
                ->where('folder_id', $folder->id)
                ->update(['folder_id' => $parent?->id]);

            $folder->delete();
        });
    }

    /**
     * Ids of a folder and everything beneath it, for "include subfolders".
     *
     * @return array<int, int>
     */
    public function subtreeIds(MediaFolder $folder): array
    {
        return MediaFolder::query()->inSubtree($folder)->pluck('id')->all();
    }

    /**
     * id => name for every folder, so a breadcrumb costs no query per crumb.
     *
     * @return array<int, string>
     */
    public function names(): array
    {
        return MediaFolder::query()->pluck('name', 'id')->all();
    }

    /* ---------------------------------------------------------------- *
     * Guards
     * ---------------------------------------------------------------- */

    private function cleanName(string $name): string
    {
        // Collapse whitespace before measuring: two names one space apart are
        // two names nobody can tell apart.
        $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '');

        if ($name === '') {
            throw new RuntimeException('Give the folder a name.');
        }

        if (mb_strlen($name) > 80) {
            throw new RuntimeException('That name is too long — keep it under 80 characters.');
        }

        // Slashes are refused because a name with one in it reads as a path in
        // every breadcrumb, and control characters because they are invisible
        // and make two folders look identical. Nothing here ever reaches the
        // filesystem — the files are content-addressed and a folder is
        // metadata — so this is about legibility, not traversal.
        if (preg_match('~[/\\\\]|[[:cntrl:]]~u', $name)) {
            throw new RuntimeException('A folder name cannot contain slashes.');
        }

        return $name;
    }

    /**
     * No two folders with the same name in the same place.
     *
     * Enforced here rather than by a unique index because MySQL treats every
     * NULL as distinct, so a unique (parent_id, name) would police subfolders
     * and quietly allow four top-level folders all called "Ramadan". One check
     * that is right in both cases beats a constraint that is right in one.
     */
    private function refuseDuplicate(?int $parentId, string $name, ?int $ignoreId): void
    {
        $clash = MediaFolder::query()
            ->when(
                $parentId === null,
                fn ($q) => $q->whereNull('parent_id'),
                fn ($q) => $q->where('parent_id', $parentId)
            )
            ->whereRaw('lower(name) = ?', [mb_strtolower($name)])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();

        if ($clash) {
            throw new RuntimeException(sprintf('There is already a folder called "%s" here.', $name));
        }
    }

    private function occupiedMessage(MediaFolder $folder, int $children, int $images): string
    {
        $parts = [];

        if ($children) {
            $parts[] = $children . ' subfolder' . ($children === 1 ? '' : 's');
        }

        if ($images) {
            $parts[] = $images . ' image' . ($images === 1 ? '' : 's');
        }

        return sprintf(
            '"%s" still holds %s. Delete it anyway and they move up to %s — nothing leaves the library.',
            $folder->name,
            implode(' and ', $parts),
            $folder->parent?->name ? '"' . $folder->parent->name . '"' : 'the top level',
        );
    }
}
