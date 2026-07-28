<?php

declare(strict_types=1);

namespace Modules\Cms\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Cms\Models\ContentBlock;
use Modules\Cms\Requests\ContentBlockRequest;
use Modules\Cms\Services\ContentService;
use RuntimeException;

/**
 * Content overrides — one public read, and admin writes.
 *
 * The read is deliberately open and cacheable: it returns the words already
 * printed on a public page, so there is nothing to protect and every visitor
 * fetches it. The writes are behind `admin:content`, which only `owner`,
 * `manager` and `editor` hold — an editor can change the site's words and can
 * see nothing else in the panel.
 */
class ContentController extends Controller
{
    public function __construct(
        private readonly ContentService $content,
    ) {
    }

    /**
     * GET /api/cms/content?page=home
     *
     * PUBLIC. Returns only overrides — the authored text is already in the HTML
     * the visitor has, so this is a small diff rather than a copy of the page.
     * A page with no overrides gets `{}` and renders exactly as written.
     */
    public function show(Request $request): JsonResponse
    {
        $data = $request->validate([
            'page' => ['required', 'string', 'max:60', 'regex:/^[a-z0-9-]+$/'],
        ]);

        return response()
            ->json(['data' => $this->content->forPage($data['page'])])
            // Short cache: content edits should appear quickly, but this is hit
            // on every page load and it is the same for everybody.
            ->header('Cache-Control', 'public, max-age=60');
    }

    /** GET /api/admin/cms/blocks — everything overridden, for the admin list. */
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => ContentBlock::query()->orderBy('page')->orderBy('key')
                ->get()->map->toAdminArray()->all(),
        ]);
    }

    /** PUT /api/admin/cms/blocks */
    public function store(ContentBlockRequest $request): JsonResponse
    {
        $admin = $request->user('admin');

        try {
            $block = $this->content->put(
                key:       $request->string('key')->toString(),
                page:      $request->string('page')->toString(),
                type:      $request->string('type')->toString(),
                value:     $request->string('value')->toString(),
                alt:       $request->input('alt'),
                adminId:   $admin->id,
                adminName: $admin->name,
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $block->toAdminArray()]);
    }

    /**
     * DELETE /api/admin/cms/blocks/{block}
     *
     * Restores the authored content by removing the override. The developer's
     * original is never stored here, so it cannot be lost — which is what makes
     * handing live editing to a non-technical person safe.
     */
    public function destroy(ContentBlock $block): JsonResponse
    {
        $this->content->revert($block);

        return response()->json(['message' => 'Reverted to the original wording.']);
    }

    /** GET /api/admin/cms/blocks/{block}/revisions */
    public function revisions(ContentBlock $block): JsonResponse
    {
        return response()->json([
            'data' => $block->revisions()->limit(20)->get()->map->toAdminArray()->all(),
        ]);
    }
}
