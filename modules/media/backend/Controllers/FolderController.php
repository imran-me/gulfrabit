<?php

declare(strict_types=1);

namespace Modules\Media\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Media\Models\MediaAsset;
use Modules\Media\Models\MediaFolder;
use Modules\Media\Services\FolderTree;
use RuntimeException;

/**
 * Folders in the image library.
 *
 * Separate from MediaController because they are separate nouns with separate
 * lifetimes: an image is a file with a hash and a URL that must never change,
 * a folder is a label you can rename at four o'clock on a Tuesday. Putting
 * both in one controller is how "delete" ends up meaning two different things.
 *
 * Every rule lives in FolderTree. This file is HTTP shaping: read the request,
 * hand it over, turn a refusal into a 422 the panel can show verbatim.
 */
class FolderController extends Controller
{
    public function __construct(private readonly FolderTree $tree)
    {
    }

    /**
     * GET /api/admin/media/folders
     *
     * The entire tree plus the unfiled count — one request, because the
     * sidebar cannot paint without all of it and two requests would let it
     * paint half.
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => $this->tree->tree(),
            'meta' => [
                'unfiled'  => $this->tree->unfiledCount(),
                'total'    => MediaAsset::query()->count(),
                'maxDepth' => MediaFolder::MAX_DEPTH,
                'colors'   => MediaFolder::COLORS,
            ],
        ]);
    }

    /** POST /api/admin/media/folders */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => ['required', 'string', 'max:120'],
            'parentId' => ['nullable', 'integer', 'exists:media_folders,id'],
            'color'    => ['nullable', 'string', 'max:16'],
        ]);

        $parent = $this->folderOrNull($data['parentId'] ?? null);

        try {
            $folder = $this->tree->create(
                $parent,
                $data['name'],
                $request->user('admin')?->id,
                $data['color'] ?? null,
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $folder->toPanelArray()], 201);
    }

    /**
     * PATCH /api/admin/media/folders/{folder}
     *
     * Rename, move, or both. `parentId` is only acted on when the key is
     * present — otherwise a rename would read a missing key as null and
     * silently drag the folder to the top level.
     */
    public function update(Request $request, MediaFolder $folder): JsonResponse
    {
        $data = $request->validate([
            'name'     => ['sometimes', 'string', 'max:120'],
            'color'    => ['sometimes', 'nullable', 'string', 'max:16'],
            'parentId' => ['sometimes', 'nullable', 'integer', 'exists:media_folders,id'],
        ]);

        try {
            if (array_key_exists('name', $data)) {
                $folder = $this->tree->rename($folder, $data['name']);
            }

            if (array_key_exists('color', $data)) {
                $folder = $this->tree->recolor($folder, $data['color']);
            }

            if (array_key_exists('parentId', $data)) {
                $folder = $this->tree->move($folder, $this->folderOrNull($data['parentId']));
            }
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $folder->fresh()->toPanelArray()]);
    }

    /**
     * DELETE /api/admin/media/folders/{folder}
     *
     * 409 with a sentence naming what is inside, unless ?force=1 — the same
     * two-step the image delete uses, for the same reason: the second click is
     * a genuinely different decision from the first, and it should feel like
     * one. Forcing relocates the contents; it never removes an image.
     */
    public function destroy(Request $request, MediaFolder $folder): JsonResponse
    {
        try {
            $this->tree->delete($folder, $request->boolean('force'));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return response()->json(['message' => 'Folder deleted.']);
    }

    private function folderOrNull(int|string|null $id): ?MediaFolder
    {
        return $id === null || $id === '' ? null : MediaFolder::findOrFail((int) $id);
    }
}
