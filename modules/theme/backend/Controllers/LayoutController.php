<?php

declare(strict_types=1);

namespace Modules\Theme\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Theme\Models\HomeLayout;
use Modules\Theme\Models\SiteSetting;
use Throwable;

/**
 * How the home page's sections are arranged. Same shape as ThemeController and
 * for the same reasons — see that file; this one only notes where it differs.
 *
 * DIFFERENCE: THE READ IS NOT ON EVERY PAGE
 * -----------------------------------------
 * Only the home page asks for this, so the cache here is about the home page
 * being the busiest single URL on the site rather than about every URL. It is
 * still never allowed to throw: a home page that 500s because a decorative
 * setting could not be read would be a spectacularly bad trade.
 */
class LayoutController extends Controller
{
    private const CACHE_TTL = 300;
    private const CACHE_KEY = 'theme:home-layout';

    /**
     * GET /api/home-layout
     *
     * Public, and the answer is the same for everybody. On any failure at all
     * this returns the shipped arrangement — which is what the static HTML
     * already renders, so the worst case is a home page that looks exactly
     * like the one in the repository.
     */
    public function show(): JsonResponse
    {
        return response()->json(['data' => ['layout' => $this->current()]])
            ->header('Cache-Control', 'public, max-age=60');
    }

    /**
     * GET /api/admin/home-layout — what the panel shows as live.
     *
     * The vocabulary is deliberately NOT sent with it. The panel authors its
     * own dropdowns, because which sections exist and which shapes they can
     * wear are structural facts about the home page rather than data: they
     * change in the same commit that adds the CSS for a new shape. Shipping a
     * second copy of the list over the wire would invite the panel to render
     * from it, and then a shape could reach a screen before the stylesheet
     * that draws it. update() is what keeps the two honest.
     */
    public function index(): JsonResponse
    {
        return response()->json(['data' => ['layout' => $this->current()]]);
    }

    /**
     * PUT /api/admin/home-layout
     *
     * The body is validated by normalising it rather than by a rule per field.
     * Fourteen `in:` rules generated from the same constant would say the same
     * thing twice and drift; normalise() is already the function that decides
     * what a valid arrangement is, and it is the one the public read trusts.
     *
     * The consequence worth stating: a malformed style silently becomes that
     * section's default instead of a 422. For a decoration chosen from a
     * dropdown that is the better failure — the merchant sees the screen
     * redraw with what was actually saved, which is the honest answer.
     */
    public function update(Request $request): JsonResponse
    {
        $layout = HomeLayout::normalise($request->input('layout'));

        SiteSetting::updateOrCreate(
            ['key' => HomeLayout::KEY],
            [
                'value' => $layout,
                'updated_by' => (string) ($request->user()?->name ?? 'admin'),
            ],
        );

        cache()->forget(self::CACHE_KEY);

        return response()->json(['data' => ['layout' => $layout]]);
    }

    /**
     * The stored arrangement, or the shipped one.
     *
     * normalise() runs on the way out as well as on the way in, because a row
     * edited straight into the database has been through neither.
     *
     * @return array<string, array{desktop: string, mobile: string}>
     */
    private function current(): array
    {
        try {
            $stored = cache()->remember(self::CACHE_KEY, self::CACHE_TTL, function (): array {
                $row = SiteSetting::find(HomeLayout::KEY);

                return HomeLayout::normalise($row?->value);
            });
        } catch (Throwable) {
            return HomeLayout::defaults();
        }

        return HomeLayout::normalise($stored);
    }
}
