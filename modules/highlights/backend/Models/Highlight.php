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
        // Best Sellers used to be the one home rail no screen could touch:
        // authored as static HTML in index.html, shown whatever the catalogue
        // said, and only replaced when this shelf was curated. A merchant
        // could unlist, archive or delete those four products and the home
        // page kept advertising them, with no control anywhere able to take
        // them down.
        //
        // home.js treats it as a shelf like the other two now — curated, then
        // the tag, then nothing — so the authored grid is the first paint and
        // the no-JS content, and stops outliving the data. Which means it
        // needs no emptyNote: the generic "showing products tagged X" line is
        // true of this rail as well now.
        'bestseller' => [
            'shows'       => 8,
            'label'       => 'Best sellers',
            'blurb'       => 'The big grid mid-page. Static until you curate it.',
            'fallbackTag' => 'bestseller',
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
