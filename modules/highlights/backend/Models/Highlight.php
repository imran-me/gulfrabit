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
    public const RAILS = [
        'premium' => [
            'label'       => 'Premium picks',
            'blurb'       => 'The first rail under the hero. Most-seen shelf on the site.',
            'fallbackTag' => 'premium',
        ],
        'new' => [
            'label'       => 'New arrivals',
            'blurb'       => 'Further down the home page.',
            'fallbackTag' => 'new',
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
