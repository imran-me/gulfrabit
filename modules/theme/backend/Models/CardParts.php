<?php

declare(strict_types=1);

namespace Modules\Theme\Models;

use Throwable;

/**
 * Which parts of a product card the shop shows — separately for a phone and
 * for a computer.
 *
 * WHY THIS IS SEPARATE FROM HomeLayout
 * ------------------------------------
 * A product card is one component and it appears on every page that lists
 * anything: home, shop, a category, search, deals, the wishlist. Its parts are
 * therefore a property of the SHOP, not of the home page, and a merchant who
 * hid the wishlist heart on the home page and found it still on the shop page
 * would be right to call that broken. Same table, same screen family, different
 * question — so a different key.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * The title, the price, the size chips and the button. Those are not
 * decoration: the first two are what the card is FOR, the chips are a control
 * that picks what goes in the basket, and the button is the sale. A setting
 * that can empty a card of its purpose is a setting that will one day be left
 * on by accident.
 *
 * And the stock badges — Sold out, Pre-order, Coming soon — are not covered by
 * `tags` and must never become hideable. They are the difference between a
 * product a shopper can buy and one they cannot, and hiding that is not a
 * style choice, it is a lie told to somebody about to try.
 *
 * THE DEFAULTS ARE THE CARD AS IT SHIPS
 * -------------------------------------
 * Everything on. A shop that has never opened this screen renders exactly as
 * before, which is what makes "no value stored" and "the stored value" the same
 * card, and a failed read harmless.
 */
final class CardParts
{
    /** The key in `site_settings`. */
    public const KEY = 'product_card';

    private const CACHE_TTL = 300;
    private const CACHE_KEY = 'theme:product-card';

    /**
     * The parts that can be switched off, in the order the screen lists them.
     *
     * Names only, with no human labels: the words a merchant reads are authored
     * in modules/theme/_fragments/card.main.html. What this list decides is
     * what a save is ALLOWED to contain.
     *
     * @var list<string>
     */
    public const PARTS = [
        'wishlist',   // the heart
        'quickview',  // the eye
        'discount',   // the -47% chip
        'tags',       // Premium / New / B2B — never the stock badges
        'brand',      // the vendor line above the title
        'rating',     // the stars
        'saving',     // the "you save" line under the price
    ];

    /**
     * Everything shown, which is the card the repository draws.
     *
     * @return array<string, array{desktop: bool, mobile: bool}>
     */
    public static function defaults(): array
    {
        $out = [];
        foreach (self::PARTS as $part) {
            $out[$part] = ['desktop' => true, 'mobile' => true];
        }

        return $out;
    }

    /**
     * Anything at all → a complete, valid answer.
     *
     * Unknown parts are dropped and a missing or non-boolean field becomes
     * "shown", one field at a time. A value left by an older release that knew
     * about a part this one has retired degrades to the shipped card for that
     * field rather than throwing the whole map away — and the direction of the
     * fallback is deliberate: when in doubt, show it. A part wrongly hidden is
     * a shopper who cannot find the wishlist; a part wrongly shown is a card
     * that looks like last week's.
     *
     * @return array<string, array{desktop: bool, mobile: bool}>
     */
    public static function normalise(mixed $raw): array
    {
        $raw = is_array($raw) ? $raw : [];
        $out = [];

        foreach (self::PARTS as $part) {
            $given = is_array($raw[$part] ?? null) ? $raw[$part] : [];
            foreach (['desktop', 'mobile'] as $device) {
                $out[$part][$device] = is_bool($given[$device] ?? null) ? $given[$device] : true;
            }
        }

        return $out;
    }

    /**
     * What the shop is actually serving.
     *
     * Lives on the model rather than in a controller because TWO endpoints
     * need it: the admin screen reads it, and it rides along on the public
     * /api/theme response so a storefront page asks for its whole appearance
     * in one request instead of two on every page in the shop.
     *
     * Never throws. A missing table is an ordinary state for a deployment that
     * has not migrated yet, and it must read as "nothing has been chosen".
     *
     * @return array<string, array{desktop: bool, mobile: bool}>
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
