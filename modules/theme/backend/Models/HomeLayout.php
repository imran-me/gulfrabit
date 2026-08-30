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
 * WHAT ELSE IS IN THE RECORD
 * --------------------------
 * Two things, not one: the SHAPE each section wears (`styles`) and the ORDER
 * they appear in (`order`). They are stored together because they are the same
 * decision made twice — "what does the home page look like" — and a merchant
 * who moves New Arrivals above Best Sellers is doing the same kind of work as
 * one who turns a grid into a rail. Two settings rows would mean two reads on
 * the busiest URL in the shop to answer one question.
 *
 * The order is stored per device for the same reason the shapes are. A phone
 * is a single column that a thumb travels down, so what sits third is roughly
 * what gets seen; a desktop shows three shelves before the fold and the
 * question is a different one. A merchant who wants New Arrivals first on a
 * phone and Best Sellers first on a desktop is not confused, they are
 * merchandising two different surfaces.
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
     *   off     not rendered at all, on this device
     *
     * `off` is a style like the others on purpose. A section being hidden is
     * one more answer to "what shape is this in", not a second axis: as a
     * style it inherits the whole pipeline it would otherwise need duplicating
     * — the closed vocabulary, normalise(), the preview URL, the mirror and
     * the single <html data-lay> attribute — and it can differ between a phone
     * and a computer, which is the whole reason a merchant asks for it. A
     * `visible` flag beside the style would have been a second field in the
     * model, the API, the admin table and the storefront resolver, saying what
     * one more word in this list already says.
     *
     * It is offered for every section, and none of them is load-bearing: the
     * page is authored so that a hidden section leaves nothing behind.
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
            'styles' => ['grid', 'loop', 'off'],
            'desktop' => 'grid',
            'mobile' => 'grid',
        ],
        'trust' => [
            'styles' => ['static', 'loop', 'off'],
            // The band has always looped on phones and stood still above them:
            // four claims fit across a desktop container and do not on a phone.
            'desktop' => 'static',
            'mobile' => 'loop',
        ],
        'premium' => [
            'styles' => ['march', 'rail', 'grid', 'off'],
            'desktop' => 'march',
            'mobile' => 'march',
        ],
        'bestseller' => [
            'styles' => ['grid', 'rail', 'march', 'off'],
            'desktop' => 'grid',
            'mobile' => 'grid',
        ],
        'new' => [
            'styles' => ['march', 'rail', 'grid', 'off'],
            'desktop' => 'march',
            'mobile' => 'march',
        ],
        'brands' => [
            'styles' => ['wall', 'loop', 'off'],
            'desktop' => 'wall',
            'mobile' => 'wall',
        ],
        'testimonials' => [
            'styles' => ['slider', 'grid', 'loop', 'off'],
            'desktop' => 'slider',
            'mobile' => 'slider',
        ],
    ];

    /**
     * The sections a merchant may move, in the order index.html authors them.
     *
     * This is NOT SECTIONS' key list and must not be derived from it. The two
     * overlap without either containing the other: `news` has no choice of
     * shape and so is absent above, but it is a section on the page and a
     * merchant may well want it higher. `hero` is the other direction — it has
     * a shape, and it is pinned, because a hero that is not first is not a
     * hero, it is a banner in the middle of a shop.
     *
     * The dormant industry band appears in neither. It ships `hidden` and
     * nothing unhides it, and a control that moves something invisible is a
     * control that reports a bug every time it is used.
     *
     * @var list<string>
     */
    public const MOVABLE = [
        'trust',
        'category',
        'premium',
        'bestseller',
        'brands',
        'new',
        'testimonials',
        'news',
    ];

    /**
     * Anything at all -> a complete, valid order.
     *
     * Same contract as normalise() below and the same reason for it: whatever
     * is in the row, the storefront gets back a list holding every movable
     * section exactly once. Unknown names are dropped, repeats are dropped,
     * and anything the stored list failed to mention is appended in the order
     * the page is authored in. So a value written by a release that knew about
     * a section this one has retired still yields a page, and a release that
     * ADDS a section puts it where the markup puts it rather than nowhere.
     *
     * @return list<string>
     */
    public static function normaliseOrder(mixed $raw): array
    {
        $given = is_array($raw) ? $raw : [];
        $out = [];

        foreach ($given as $name) {
            if (is_string($name) && in_array($name, self::MOVABLE, true) && !in_array($name, $out, true)) {
                $out[] = $name;
            }
        }

        foreach (self::MOVABLE as $name) {
            if (!in_array($name, $out, true)) {
                $out[] = $name;
            }
        }

        return $out;
    }

    /**
     * The arrangement of a shop that has never touched this screen.
     *
     * @return array{styles: array<string, array{desktop: string, mobile: string}>, order: array{desktop: list<string>, mobile: list<string>}}
     */
    public static function defaults(): array
    {
        $styles = [];
        foreach (self::SECTIONS as $key => $spec) {
            $styles[$key] = ['desktop' => $spec['desktop'], 'mobile' => $spec['mobile']];
        }

        return [
            'styles' => $styles,
            'order' => ['desktop' => self::MOVABLE, 'mobile' => self::MOVABLE],
        ];
    }

    /**
     * Anything at all → a complete, valid arrangement: both halves, both
     * devices, every section accounted for.
     *
     * A ROW WRITTEN BEFORE ORDERING EXISTED STILL READS
     * -------------------------------------------------
     * The record used to BE the styles map — section keys at the top level,
     * no wrapper. Rather than migrate those rows, this reads them: a value
     * carrying neither `styles` nor `order` is a value from that release, and
     * the whole of it is the styles map. It gets the shipped order alongside,
     * which is the order that release was rendering anyway, so the page does
     * not move for a merchant who never asked it to. The next save writes the
     * new shape and the question does not come up again.
     *
     * @return array{styles: array<string, array{desktop: string, mobile: string}>, order: array{desktop: list<string>, mobile: list<string>}}
     */
    public static function normalise(mixed $raw): array
    {
        $raw = is_array($raw) ? $raw : [];

        $wrapped = array_key_exists('styles', $raw) || array_key_exists('order', $raw);
        $rawStyles = $wrapped ? ($raw['styles'] ?? null) : $raw;
        $rawOrder = $wrapped ? ($raw['order'] ?? null) : null;
        $rawOrder = is_array($rawOrder) ? $rawOrder : [];

        return [
            'styles' => self::normaliseStyles($rawStyles),
            'order' => [
                'desktop' => self::normaliseOrder($rawOrder['desktop'] ?? null),
                'mobile' => self::normaliseOrder($rawOrder['mobile'] ?? null),
            ],
        ];
    }

    /**
     * Anything at all → a complete, valid set of shapes.
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
    public static function normaliseStyles(mixed $raw): array
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
