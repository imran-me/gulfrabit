<?php

declare(strict_types=1);

namespace Modules\Hero\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Hero\Models\HeroSetting;
use Modules\Hero\Models\HeroSlide;
use Modules\Hero\Requests\HeroSlideRequest;

/**
 * Managing the home page banners.
 *
 * Guarded by `admin:content` on the route group — this is merchandising, the
 * same capability that edits page copy, not one that touches money or
 * customers.
 */
class AdminHeroController extends Controller
{
    /** GET /api/admin/hero — every slide, live or not, in panel order. */
    public function index(): JsonResponse
    {
        // The same guard the public read carries, and for the same window: code
        // deployed ahead of its migration. Without it this screen answers 500
        // with a SQL error, which tells a merchant nothing and reads as the
        // feature being broken rather than one command away from working.
        if (! Schema::hasTable('hero_slides')) {
            return response()->json([
                'data' => [],
                'meta' => [
                    'ready'    => false,
                    'settings' => HeroSetting::current()->toPublicArray(),
                ],
            ]);
        }

        return response()->json([
            // Deleted banners ride along in the same payload. A shop runs a
            // handful of banners, not a paginated list, and this screen is a
            // running order you drag — the client keeps them out of that order
            // and draws them in their own section underneath.
            'data' => HeroSlide::query()
                ->withTrashed()
                ->orderBy('sort_order')->orderBy('id')
                ->get()->map->toAdminArray()->all(),
            'meta' => [
                'ready'    => true,
                'settings' => HeroSetting::current()->toPublicArray(),
            ],
        ]);
    }

    /** POST /api/admin/hero */
    public function store(HeroSlideRequest $request): JsonResponse
    {
        $slide = HeroSlide::create($this->attributes($request) + [
            // Appended, not inserted at the top. A new banner going live above
            // the campaign currently running, because somebody created it to
            // work on later, is how a draft ends up as the front page.
            'sort_order' => (int) (HeroSlide::query()->max('sort_order') ?? 0) + 1,
        ]);

        return response()->json(['data' => $slide->toAdminArray()], 201);
    }

    /** PATCH /api/admin/hero/{slide} */
    public function update(HeroSlideRequest $request, HeroSlide $slide): JsonResponse
    {
        $slide->update($this->attributes($request));

        return response()->json(['data' => $slide->fresh()->toAdminArray()]);
    }

    /**
     * DELETE /api/admin/hero/{slide}
     *
     * A real delete, unlike products. A banner is artwork with no history
     * hanging off it — no order refers to one — so keeping a soft-deleted pile
     * of last year's campaigns would be clutter pretending to be caution. The
     * panel offers "switch off" for anything worth keeping, and says so.
     */
    public function destroy(HeroSlide $slide): JsonResponse
    {
        // Soft, and switched off on the way out — the same pairing the product
        // and coupon deletes use. Restoring must not put a banner straight back
        // onto the front page: undoing a mistake should not publish anything.
        //
        // sort_order is deliberately untouched, so a restored banner returns to
        // the place it held in the rotation rather than to the end.
        $slide->is_active = false;
        $slide->save();
        $slide->delete();

        return response()->json([
            'message' => 'Banner deleted. It is under Deleted below, and can be put back.',
        ]);
    }

    /** POST /api/admin/hero/{slide}/restore */
    public function restore(string $slide): JsonResponse
    {
        // A route parameter arrives as a string; cast here rather than leaning
        // on the container being in coercive mode. See the same note on
        // AdminCustomerController::restore.
        $model = HeroSlide::withTrashed()->findOrFail((int) $slide);

        if (! $model->trashed()) {
            return response()->json(['message' => 'That banner is not deleted.'], 422);
        }

        $model->restore();

        return response()->json([
            'data'    => $model->toAdminArray(),
            'message' => 'Banner restored, still switched off. Switch it on to put it back in the rotation.',
        ]);
    }

    /**
     * POST /api/admin/hero/order
     *
     * The whole running order in one request, because that is what a drag
     * produces: moving one banner changes the position of every banner after
     * it, and sending them one at a time leaves the list briefly holding two
     * slides that both think they are third.
     */
    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids'   => ['required', 'array', 'min:1', 'max:50'],
            'ids.*' => ['integer', 'exists:hero_slides,id'],
        ]);

        DB::transaction(function () use ($data): void {
            foreach ($data['ids'] as $position => $id) {
                HeroSlide::query()->whereKey($id)->update(['sort_order' => $position]);
            }
        });

        return response()->json(['data' => ['ok' => true]]);
    }

    /** PATCH /api/admin/hero/settings */
    public function settings(Request $request): JsonResponse
    {
        $data = $request->validate([
            // 2 seconds is the floor because below it the carousel is
            // unreadable, and 30 the ceiling because past it a visitor will
            // never see the second banner. Both are enforced here rather than
            // only in the panel, where a number input is a suggestion.
            'intervalMs'   => ['sometimes', 'integer', 'min:2000', 'max:30000'],
            'transition'   => ['sometimes', 'in:fade,slide,zoom,none'],
            'transitionMs' => ['sometimes', 'integer', 'min:0', 'max:2000'],
            'easing'       => ['sometimes', 'in:ease,ease-in-out,linear,spring'],
            'kenBurns'     => ['sometimes', 'boolean'],
            'autoplay'     => ['sometimes', 'boolean'],
        ]);

        $settings = HeroSetting::current();

        $settings->fill(array_filter([
            'interval_ms'     => $data['intervalMs']   ?? null,
            'transition'      => $data['transition']   ?? null,
            'transition_ms'   => $data['transitionMs'] ?? null,
            'easing'          => $data['easing']       ?? null,
            'updated_by_name' => $request->user('admin')->name,
        ], fn ($v) => $v !== null));

        // Booleans are set outside the array_filter above: `false` is a value
        // somebody chose, and filtering nulls would throw away every attempt to
        // switch these OFF.
        if (array_key_exists('kenBurns', $data)) {
            $settings->ken_burns = $data['kenBurns'];
        }
        if (array_key_exists('autoplay', $data)) {
            $settings->autoplay = $data['autoplay'];
        }

        $settings->save();

        return response()->json(['data' => $settings->fresh()->toPublicArray()]);
    }

    /** @return array<string, mixed> */
    private function attributes(HeroSlideRequest $request): array
    {
        $out = [
            'updated_by_name' => $request->user('admin')->name,
        ];

        $map = [
            'imagePath'   => 'image_path',
            'alt'         => 'alt',
            'headline'    => 'headline',
            'subheadline' => 'subheadline',
            'linkType'    => 'link_type',
            'sortOrder'   => 'sort_order',
            'isActive'    => 'is_active',
            'startsAt'    => 'starts_at',
            'endsAt'      => 'ends_at',
        ];

        foreach ($map as $in => $column) {
            if ($request->has($in)) {
                $out[$column] = $request->input($in);
            }
        }

        // Cleared whenever the type says there is nothing to point at, so a
        // slide switched from "product" to "none" cannot keep a stale product
        // id that reappears if somebody switches it back.
        if ($request->has('linkType') || $request->has('linkValue')) {
            $out['link_value'] = $request->input('linkType') === 'none'
                ? null
                : trim((string) $request->input('linkValue')) ?: null;
        }

        return $out;
    }
}
