<?php

declare(strict_types=1);

namespace Modules\Media\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Media\Models\MediaAsset;
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

    public function __construct(private readonly ImageStore $store)
    {
    }

    /**
     * GET /api/admin/media
     *
     * Newest first, paged. The picker loads a page at a time rather than the
     * whole library: on a phone, a thousand thumbnails is a stalled screen.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = min(60, max(12, (int) $request->query('perPage', 24)));

        $query = MediaAsset::query()->latest('id');

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
            'file' => ['required', 'file', 'max:' . self::MAX_KB],
            'alt'  => ['nullable', 'string', 'max:255'],
        ], [
            'file.max' => 'That image is over 8 MB. Most product photos are well under 2 MB.',
        ]);

        $file = $request->file('file');

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
            return response()->json([
                'data'      => $existing->toPanelArray(),
                'duplicate' => true,
                'message'   => 'That image is already in the library — reusing it.',
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

    /** PATCH /api/admin/media/{asset} — alt text is the only editable field. */
    public function update(Request $request, MediaAsset $asset): JsonResponse
    {
        $data = $request->validate([
            'alt' => ['present', 'nullable', 'string', 'max:255'],
        ]);

        $asset->update(['alt' => $data['alt'] ?: null]);

        return response()->json(['data' => $asset->fresh()->toPanelArray()]);
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
