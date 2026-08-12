<?php

declare(strict_types=1);

namespace Modules\Hero\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Schema;
use Modules\Hero\Models\HeroSetting;
use Modules\Hero\Models\HeroSlide;

/**
 * The storefront's read of the hero. Public, cached, and never a reason the
 * home page fails.
 */
class HeroController extends Controller
{
    /**
     * GET /api/hero
     *
     * ONE REQUEST, EVERYTHING THE CAROUSEL NEEDS. Slides and timing arrive
     * together because the page cannot start until it has both — the dot that
     * fills as a slide is held is animated from `intervalMs`, and a second
     * round trip for that number would leave the first slide either frozen or
     * animating at the wrong speed.
     *
     * Returns an empty list rather than an error when the table is not there.
     * That is the window between a deploy landing and its migration running,
     * and the home page must survive it — the storefront treats an empty
     * answer as "keep the banners built into the page", so the shop looks
     * exactly as it did before this module existed.
     */
    public function index(): JsonResponse
    {
        if (! Schema::hasTable('hero_slides')) {
            return response()->json(['data' => [], 'meta' => ['ready' => false]]);
        }

        $slides = HeroSlide::query()->live()->get()->map->toPublicArray()->all();

        return response()->json([
            'data' => $slides,
            'meta' => [
                // False when the panel holds no live banners at all. The page
                // reads this to tell "the merchant has not set any up" apart
                // from "the merchant deliberately cleared them", and keeps its
                // built-in artwork in the first case.
                'ready'    => $slides !== [],
                'settings' => HeroSetting::current()->toPublicArray(),
            ],
        ])->header('Cache-Control', 'public, max-age=60');
    }
}
