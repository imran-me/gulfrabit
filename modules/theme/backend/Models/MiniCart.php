<?php

declare(strict_types=1);

namespace Modules\Theme\Models;

use Throwable;

/**
 * Which controls the slide-in mini cart shows.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * The drawer's footer offers two ways out: View Cart and Checkout. That is the
 * right pair for a large basket somebody wants to edit, and a distraction for a
 * shop selling two or three things at a time, where the cart page is a stop on
 * the way to the only button that matters. Which of those a shop is, is a
 * merchandising judgement and changes with the season — so it is a setting, not
 * a commit.
 *
 * WHY IT IS NOT A DELETION
 * ------------------------
 * Switching View Cart off HIDES it — the button stays in the markup, the cart
 * page stays reachable from the header and the footer, and turning it back on
 * is one tick. A control removed from the code by a merchant's preference is a
 * control nobody can give back without a deploy.
 *
 * WHY IT IS SEPARATE FROM CardParts
 * ---------------------------------
 * Same table, same screen family, different question — exactly the relationship
 * CardParts has with HomeLayout. A product card and a mini cart share nothing
 * but the fact that a merchant can dress both.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * Checkout, the ticks and the bin. Checkout is the sale. The per-line tick and
 * the bin are how a shopper says what they are buying and what they are not,
 * and a shop that could switch those off would be a shop where the only way to
 * not buy something is to delete it — which is the state this drawer was in
 * before, and the reason the ticks were added.
 *
 * THE DEFAULT IS THE DRAWER AS IT SHIPS
 * -------------------------------------
 * Shown. A shop that has never opened this screen renders exactly as before,
 * which is what makes "no value stored" and "the stored value" the same drawer
 * and a failed read harmless.
 */
final class MiniCart
{
    /** The key in `site_settings`. */
    public const KEY = 'mini_cart';

    private const CACHE_TTL = 300;
    private const CACHE_KEY = 'theme:mini-cart';

    /**
     * The parts that can be switched off, in the order the screen lists them.
     *
     * Names only. The words a merchant reads are authored in
     * modules/theme/_fragments/theme.main.html, and a second copy here would be
     * a second copy to keep in step for no reader's benefit. What this list
     * decides is what a save is ALLOWED to contain.
     *
     * @var list<string>
     */
    public const PARTS = [
        'view_cart',   // the outline button beside Checkout in the drawer footer
    ];

    /**
     * Everything shown, which is the drawer the repository draws.
     *
     * @return array<string, bool>
     */
    public static function defaults(): array
    {
        $out = [];
        foreach (self::PARTS as $part) {
            $out[$part] = true;
        }

        return $out;
    }

    /**
     * Anything at all → a complete, valid answer.
     *
     * Unknown parts are dropped and a missing or non-boolean field becomes
     * "shown", the same direction of fallback CardParts uses and for the same
     * reason: when in doubt, show it. A part wrongly hidden is a shopper who
     * cannot reach their cart; a part wrongly shown is a drawer that looks like
     * last week's.
     *
     * @return array<string, bool>
     */
    public static function normalise(mixed $raw): array
    {
        $raw = is_array($raw) ? $raw : [];
        $out = [];

        foreach (self::PARTS as $part) {
            $out[$part] = is_bool($raw[$part] ?? null) ? $raw[$part] : true;
        }

        return $out;
    }

    /**
     * What the shop is actually serving.
     *
     * Rides on the public GET /api/theme rather than having an endpoint of its
     * own, exactly as CardParts does: the drawer is built on every page in the
     * shop, and a second public read for one boolean would be a second request
     * everywhere. See ThemeController::show().
     *
     * Never throws. A missing table is an ordinary state for a deployment that
     * has not migrated yet, and it must read as "nothing has been chosen".
     *
     * @return array<string, bool>
     */
    public static function published(): array
    {
        try {
            $stored = cache()->remember(self::CACHE_KEY, self::CACHE_TTL, static function (): array {
                return self::normalise(SiteSetting::find(self::KEY)?->value);
            });
        } catch (Throwable) {
            return self::defaults();
        }

        // A row edited straight into the database has been through neither the
        // validation on write nor the normalise inside the cache.
        return self::normalise($stored);
    }

    public static function forget(): void
    {
        try { cache()->forget(self::CACHE_KEY); } catch (Throwable) { /* no cache store */ }
    }
}
