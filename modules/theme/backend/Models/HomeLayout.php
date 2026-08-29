<?php

declare(strict_types=1);

namespace Modules\Theme\Models;

/**
 * How each home-page section is ARRANGED — and separately for a phone and for
 * a computer.
 *
 * WHY THIS IS NOT A TABLE
 * -----------------------
 * It is one value for the whole shop, exactly like the theme, so it lives in
 * `site_settings` under one key — the table this module already owns and the
 * one the migration was written general for. A `home_layouts` table with a row
 * per section would be seven rows that are only ever read together.
 *
 * WHY DESKTOP AND MOBILE ARE SEPARATE VALUES
 * ------------------------------------------
 * Because the answer genuinely differs. A looping row of category tiles is the
 * right shape on a 390px phone, where the alternative is two tiles per line and
 * a lot of scrolling, and the wrong shape on a 1440px screen where eight fit
 * across with room to spare. Storing one value and deriving the other would
 * force a compromise nobody asked for, so both are stored.
 *
 * The dividing line is 768px, the same one modules/home/home.css has always
 * used for the trust band. It is stated in the admin copy, because a merchant
 * choosing "Phone" deserves to know where the shop thinks a phone ends.
 *
 * THE DEFAULTS ARE THE SITE AS IT SHIPS
 * -------------------------------------
 * Every default below is what index.html and home.css already do, so a shop
 * that has never opened this screen renders byte-for-byte as before. That is
 * not a nicety: it is what makes "no value stored" and "the value stored is
 * the default" the same page, which in turn means a failed read is harmless.
 */
final class HomeLayout
{
    /** The key in `site_settings`. */
    public const KEY = 'home_layout';

    /**
     * The vocabulary. A style name is only ever one of these, and it reaches
     * an HTML attribute, so the set is closed and validated on the way in.
     *
     *   grid    a static grid that wraps
     *   loop    a single row that travels right-to-left, for ever
     *   rail    a swipeable row with arrows; moves only when you move it
     *   march   a rail that also drifts leftward on its own
     *   slider  one card at a time, paged
     *   static  a plain row, no motion of any kind
     *   wall    centred, wrapping, non-uniform — the brand wall's own shape
     *
     * Section keys only, with no human names beside them: the words a merchant
     * reads are authored in modules/theme/_fragments/layout.main.html, and a
     * second copy here would be a second copy to keep in step for no reader's
     * benefit. What this constant is for is deciding what is ALLOWED.
     *
     * @var array<string, array{styles: list<string>, desktop: string, mobile: string}>
     */
    public const SECTIONS = [
        'category' => [
            'styles' => ['grid', 'loop'],
            'desktop' => 'grid',
            'mobile' => 'grid',
        ],
        'trust' => [
            'styles' => ['static', 'loop'],
            // The band has always looped on phones and stood still above them:
            // four claims fit across a desktop container and do not on a phone.
            'desktop' => 'static',
            'mobile' => 'loop',
        ],
        'premium' => [
            'styles' => ['march', 'rail', 'grid'],
            'desktop' => 'march',
            'mobile' => 'march',
        ],
        'bestseller' => [
            'styles' => ['grid', 'rail', 'march'],
            'desktop' => 'grid',
            'mobile' => 'grid',
        ],
        'new' => [
            'styles' => ['march', 'rail', 'grid'],
            'desktop' => 'march',
            'mobile' => 'march',
        ],
        'brands' => [
            'styles' => ['wall', 'loop'],
            'desktop' => 'wall',
            'mobile' => 'wall',
        ],
        'testimonials' => [
            'styles' => ['slider', 'grid', 'loop'],
            'desktop' => 'slider',
            'mobile' => 'slider',
        ],
    ];

    /**
     * The arrangement of a shop that has never touched this screen.
     *
     * @return array<string, array{desktop: string, mobile: string}>
     */
    public static function defaults(): array
    {
        $out = [];
        foreach (self::SECTIONS as $key => $spec) {
            $out[$key] = ['desktop' => $spec['desktop'], 'mobile' => $spec['mobile']];
        }

        return $out;
    }

    /**
     * Anything at all → a complete, valid arrangement.
     *
     * Every unknown section is dropped and every unknown style falls back to
     * that section's default, one field at a time. So a value left by an older
     * release that knew about a section this one has retired, or a style that
     * has since been renamed, degrades to the shipped arrangement for that one
     * field instead of throwing the whole map away. The storefront never has to
     * ask whether what it was handed makes sense.
     *
     * @return array<string, array{desktop: string, mobile: string}>
     */
    public static function normalise(mixed $raw): array
    {
        $raw = is_array($raw) ? $raw : [];
        $out = [];

        foreach (self::SECTIONS as $key => $spec) {
            $given = is_array($raw[$key] ?? null) ? $raw[$key] : [];

            foreach (['desktop', 'mobile'] as $device) {
                $style = $given[$device] ?? null;
                $out[$key][$device] = (is_string($style) && in_array($style, $spec['styles'], true))
                    ? $style
                    : $spec[$device];
            }
        }

        return $out;
    }
}
