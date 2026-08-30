<?php

declare(strict_types=1);

namespace Modules\Theme\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Theme\Models\CardParts;
use Modules\Theme\Models\MiniCart;
use Modules\Theme\Models\SiteSetting;
use Throwable;

/**
 * Which theme the storefront is wearing.
 *
 * The public read is on the hot path — every page load asks — so it is cached
 * and it never throws. The admin write is one validated string.
 */
class ThemeController extends Controller
{
    /** Long enough to matter, short enough that a merchant does not think the
     *  switch is broken while they wait. Busted explicitly on write anyway;
     *  this TTL only covers a cache that outlived its invalidation. */
    private const CACHE_TTL = 300;
    private const CACHE_KEY = 'theme:storefront';

    /**
     * GET /api/theme
     *
     * NEVER 500s and never 404s. This is called by every page on the site. If
     * the table was never migrated, or the database is unreachable, the
     * correct answer is "classic" — the default the static HTML already ships
     * — not an error that the storefront would have to interpret. A theme is
     * decoration; nothing about it is worth a broken page.
     */
    public function show(): JsonResponse
    {
        /* `card` rides along rather than getting an endpoint of its own. A
           product card is on every page that lists anything, so a second
           public read would be a second request on every page in the shop for
           an answer that is cached, identical for everybody and about the same
           thing: how the shop looks. `theme` stays exactly where it was, so
           nothing that reads this response today notices. */
        return response()->json(['data' => [
            'theme' => $this->current(),
            'card' => CardParts::published(),
            /* And which controls the mini cart shows, for the same reason: the
               drawer is built on every page in the shop. Two cached booleans'
               worth of payload against one more round trip everywhere. */
            'cart' => MiniCart::published(),
        ]])
            // Public, identical for everyone, and cheap to re-fetch. A minute
            // at the edge takes this off the origin almost entirely while
            // keeping a switch visible to visitors within the minute.
            ->header('Cache-Control', 'public, max-age=60');
    }

    /** GET /api/admin/theme — what the panel shows as Live. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => ['theme' => $this->current()]]);
    }

    /**
     * PUT /api/admin/theme
     *
     * Validated against the model's list rather than a free string: this value
     * ends up in an HTML attribute on every page of the site, and the one
     * thing that must never happen is an unvetted string getting there.
     */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'theme' => ['required', 'string', 'in:' . implode(',', SiteSetting::THEMES)],
        ]);

        SiteSetting::updateOrCreate(
            ['key' => SiteSetting::THEME_KEY],
            [
                'value' => ['theme' => $data['theme']],
                'updated_by' => (string) ($request->user()?->name ?? 'admin'),
            ],
        );

        cache()->forget(self::CACHE_KEY);

        return response()->json(['data' => ['theme' => $data['theme']]]);
    }

    /**
     * The stored theme, or the default.
     *
     * The try/catch is the whole point of this method: a missing table is a
     * perfectly ordinary state for a deployment that has not run migrations
     * yet, and it must read as "no theme has been chosen", not as an outage.
     */
    private function current(): string
    {
        try {
            $theme = cache()->remember(self::CACHE_KEY, self::CACHE_TTL, function (): string {
                $row = SiteSetting::find(SiteSetting::THEME_KEY);

                return (string) ($row?->value['theme'] ?? SiteSetting::DEFAULT_THEME);
            });
        } catch (Throwable) {
            return SiteSetting::DEFAULT_THEME;
        }

        // Belt and braces: a value edited straight into the database, or left
        // by an older release, must not reach the page.
        return in_array($theme, SiteSetting::THEMES, true) ? $theme : SiteSetting::DEFAULT_THEME;
    }
}
