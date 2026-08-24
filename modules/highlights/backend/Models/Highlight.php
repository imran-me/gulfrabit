<?php

declare(strict_types=1);

namespace Modules\Highlights\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Catalog\Models\Product;

/**
 * One product on one home-page shelf.
 *
 * @property string $rail
 * @property int    $product_id
 * @property int    $position
 */
class Highlight extends Model
{
    /**
     * The shelves the panel offers, in the order they appear down the page.
     *
     * Adding one here plus a `<div data-rail="…">` in index.html is the whole
     * job — no migration, because `rail` is a plain string column. Removing one
     * leaves its rows in the table, ignored; that is deliberate, so retiring a
     * shelf from the design for a season does not throw away the curation.
     *
     * `fallbackTag` is what the home page used before this module existed and
     * what it drops back to when a shelf is empty. Keeping the old mechanism
     * as the floor means an unconfigured install still shows products rather
     * than three blank strips.
     */
    /**
     * How many products each shelf actually RENDERS on the home page.
     *
     * Kept here because the panel needs it and nothing else knew it: the
     * numbers live in home.js as arguments to shelf() and shelf('bestseller',
     * 8), so a merchant could curate twelve products, save, and have the last
     * four never appear with nothing on the screen saying why. MAX_PER_RAIL in
     * the controller is the storage cap; this is the visible one, and they are
     * different questions.
     *
     * If a rail's size changes in home.js, change it here too — there is no
     * way for one to read the other across a static build and an API.
     */
    public const RAILS = [
        'premium' => [
            'shows'       => 8,
            'label'       => 'Premium picks',
            'blurb'       => 'The first rail under the hero. Most-seen shelf on the site.',
            'fallbackTag' => 'premium',
        ],
        'new' => [
            'shows'       => 8,
            'label'       => 'New arrivals',
            'blurb'       => 'Further down the home page.',
            'fallbackTag' => 'new',
        ],
        // Best Sellers was the one home rail no screen could touch: authored
        // as static HTML in index.html. The static markup is still there and
        // still ships — it is the no-JS content and the no-backend fallback —
        // but when this shelf has a curation, home.js swaps it in. See
        // initProductSections in modules/home/home.js.
        //
        // `emptyNote` overrides the generic empty-shelf copy. The generic line
        // says "the site is showing products tagged X until you pick some",
        // which is true of the other rails and FALSE here: home.js only swaps
        // the static grid for a curated shelf, never for a tag fallback, so an
        // uncurated Best Sellers shows the authored HTML. Telling a merchant
        // otherwise sends them debugging a tag that is working as designed.
        'bestseller' => [
            'shows'       => 8,
            'label'       => 'Best sellers',
            'blurb'       => 'The big grid mid-page. Static until you curate it.',
            'fallbackTag' => 'bestseller',
            'emptyNote'   => 'Nothing chosen. The home page is showing its built-in '
                           . 'Best Sellers grid; pick products here to replace it with your own.',
        ],
    ];

    protected $fillable = ['rail', 'product_id', 'position'];

    protected function casts(): array
    {
        return ['position' => 'integer'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * One shelf, in order, with its products loaded.
     *
     * Deliberately does NOT filter out unlisted products here — see the
     * controllers. The storefront hides them; the panel must still show them,
     * or a merchant cannot tell why a shelf of six is rendering four.
     */
    public function scopeRail(Builder $q, string $rail): Builder
    {
        return $q->where('rail', $rail)->orderBy('position')->orderBy('id');
    }
}
