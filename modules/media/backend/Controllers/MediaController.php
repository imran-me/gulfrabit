<?php

declare(strict_types=1);

namespace Modules\Media\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Media\Models\MediaAsset;
use Modules\Media\Models\MediaFolder;
use Modules\Media\Services\FolderTree;
use Modules\Media\Services\ImageStore;
use RuntimeException;

/**
 * The media library API.
 *
 * Every route here is behind the `admin` middleware and the `media` permission
 * (see routes.php). There is no public upload path and there must never be
 * one — an unauthenticated writer on the document root is how sites become
 * someone else's file host.
 */
class MediaController extends Controller
{
    /** Hard ceiling in kilobytes. Also enforced by the client, for the message. */
    private const MAX_KB = 8192;

    public function __construct(
        private readonly ImageStore $store,
        private readonly FolderTree $tree,
    ) {
    }

    /**
     * GET /api/admin/media
     *
     * Newest first, paged. The picker loads a page at a time rather than the
     * whole library: on a phone, a thousand thumbnails is a stalled screen.
     *
     * `folder` decides what is in scope, and the default is deliberately
     * everything — a caller written before folders existed keeps seeing the
     * whole library rather than silently narrowing to the top level:
     *
     *   (absent) / all   the entire library
     *   root             filed nowhere — the top level
     *   <id>             that folder; add deep=1 to include its subfolders
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = min(60, max(12, (int) $request->query('perPage', 24)));

        $query = MediaAsset::query()->latest('id');

        $scope = (string) $request->query('folder', 'all');

        if ($scope === 'root') {
            $query->whereNull('folder_id');
        } elseif ($scope !== 'all' && $scope !== '') {
            $folder = MediaFolder::findOrFail((int) $scope);

            $query->whereIn(
                'folder_id',
                $request->boolean('deep') ? $this->tree->subtreeIds($folder) : [$folder->id]
            );
        }

        if ($term = trim((string) $request->query('q', ''))) {
            $query->where(function ($q) use ($term): void {
                $q->where('original_name', 'like', "%{$term}%")
                    ->orWhere('alt', 'like', "%{$term}%");
            });
        }

        $page = $query->paginate($perPage);

        return response()->json([
            'data' => collect($page->items())
                ->map(fn (MediaAsset $a): array => $a->toPanelArray())
                ->all(),
            'meta' => [
                'page'    => $page->currentPage(),
                'pages'   => $page->lastPage(),
                'total'   => $page->total(),
            ],
        ]);
    }

    /**
     * POST /api/admin/media
     *
     * One file per request. Multi-file uploads are the client sending several
     * of these in parallel, which means one failure does not take the batch
     * down and the progress bar is real rather than a guess.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file'     => ['required', 'file', 'max:' . self::MAX_KB],
            'alt'      => ['nullable', 'string', 'max:255'],
            'folderId' => ['nullable', 'integer', 'exists:media_folders,id'],
        ], [
            'file.max' => 'That image is over 8 MB. Most product photos are well under 2 MB.',
        ]);

        $file = $request->file('file');
        $folderId = $request->filled('folderId') ? (int) $request->input('folderId') : null;

        // Hash the ORIGINAL bytes, before re-encoding. Re-encoding is not
        // guaranteed to be byte-identical across GD versions, so hashing the
        // output would let the same photo deduplicate today and not after a
        // PHP upgrade.
        $hash = hash_file('sha256', $file->getRealPath());

        // Already have it. Return the existing row so the caller's flow is the
        // same either way — it wanted a URL, and here is the URL. Uploading a
        // duplicate is a normal thing for a person to do, not an error.
        $existing = MediaAsset::where('hash', $hash)->first();

        if ($existing) {
            // Deliberately NOT refiled into the folder being uploaded to. The
            // image may already be filed somewhere on purpose, and quietly
            // moving it would change what another folder contains as a side
            // effect of an upload nobody thought of as a move. Say where it
            // is instead, and let the merchant drag it if they meant to.
            return response()->json([
                'data'      => $existing->toPanelArray(),
                'duplicate' => true,
                'message'   => $existing->folder_id === $folderId
                    ? 'That image is already in the library — reusing it.'
                    : sprintf(
                        'That image is already in the library, filed under "%s" — reusing it there.',
                        $existing->folder?->name ?? 'Unfiled'
                    ),
            ]);
        }

        try {
            $stored = $this->store->store($file, $hash);
        } catch (RuntimeException $e) {
            // These messages are written for the merchant, not for a log, so
            // they are safe and useful to show as-is.
            return response()->json(['message' => $e->getMessage()], 422);
        }

        try {
            $asset = MediaAsset::create([
                'hash'          => $hash,
                'path'          => $stored['path'],
                'folder_id'     => $folderId,
                'original_name' => mb_substr($file->getClientOriginalName(), 0, 255),
                'mime'          => $stored['mime'],
                'bytes'         => $stored['bytes'],
                'width'         => $stored['width'],
                'height'        => $stored['height'],
                'alt'           => $request->input('alt') ?: null,
                'uploaded_by'   => $request->user('admin')?->id,
            ]);
        } catch (\Throwable $e) {
            // The file landed but the row did not. Leaving the file would be
            // an orphan nothing can ever reference or clean up.
            $this->store->delete($stored['path']);
            throw $e;
        }

        return response()->json(['data' => $asset->toPanelArray()], 201);
    }

    /**
     * PATCH /api/admin/media/{asset}
     *
     * Alt text and filing. Both keys are optional and both are read with
     * array_key_exists rather than a truthiness test, because null is a
     * meaningful value for each of them — "no description" and "top level" —
     * and `?:` cannot tell those apart from "not sent".
     */
    public function update(Request $request, MediaAsset $asset): JsonResponse
    {
        $data = $request->validate([
            'alt'      => ['sometimes', 'nullable', 'string', 'max:255'],
            'folderId' => ['sometimes', 'nullable', 'integer', 'exists:media_folders,id'],
        ]);

        $changes = [];

        if (array_key_exists('alt', $data)) {
            $changes['alt'] = $data['alt'] ?: null;
        }

        if (array_key_exists('folderId', $data)) {
            $changes['folder_id'] = $data['folderId'] ?: null;
        }

        if ($changes) {
            $asset->update($changes);
        }

        return response()->json(['data' => $asset->fresh()->toPanelArray()]);
    }

    /**
     * POST /api/admin/media/move — file several images at once.
     *
     * One request for the whole selection, not one per image. Dragging forty
     * photos into a folder over a phone connection must not be forty chances
     * to half-finish: this either files all of them or none.
     *
     * Nothing on disk moves. See the migration — a folder is metadata, and the
     * URL of every image here is the same after this call as before it, which
     * is what makes reorganising the library safe to do on a live shop.
     */
    public function move(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids'      => ['required', 'array', 'min:1', 'max:200'],
            'ids.*'    => ['integer'],
            'folderId' => ['present', 'nullable', 'integer', 'exists:media_folders,id'],
        ]);

        $folderId = $data['folderId'] ?: null;

        $moved = MediaAsset::query()
            ->whereIn('id', $data['ids'])
            ->update(['folder_id' => $folderId]);

        $where = $folderId
            ? MediaFolder::find($folderId)?->name ?? 'that folder'
            : 'the top level';

        return response()->json([
            'moved'   => $moved,
            'message' => sprintf(
                '%d image%s moved to %s.',
                $moved,
                $moved === 1 ? '' : 's',
                $where
            ),
        ]);
    }

    /**
     * DELETE /api/admin/media/{asset}
     *
     * Refuses while anything still uses the image, unless ?force=1. The
     * default has to be refusal: a deleted product photo is a broken picture
     * on a live shop, and the merchant deleting it has no way to know which
     * page it was on.
     */
    public function destroy(Request $request, MediaAsset $asset): JsonResponse
    {
        $force = $request->boolean('force');

        if ($asset->usage_count > 0 && ! $force) {
            return response()->json([
                'message' => sprintf(
                    'This image is used in %d place%s. Remove it there first, or delete anyway.',
                    $asset->usage_count,
                    $asset->usage_count === 1 ? '' : 's'
                ),
                'usedBy' => $asset->usage_count,
            ], 409);
        }

        $path = $asset->path;

        // Row first, inside a transaction: if the unlink fails we would rather
        // have a file with no row (invisible, reclaimable) than a row pointing
        // at nothing (a broken image in every picker).
        DB::transaction(function () use ($asset): void {
            $asset->delete();
        });

        $this->store->delete($path);

        return response()->json(['message' => 'Image deleted.']);
    }
}
