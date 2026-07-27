# modules/bundle

The "goes well together" block on a product page: a small set of products that
belong with the one being viewed, with a live total and the real saving.

Delete this folder, remove its two entries from `tools/assemble.py` and its
lines from `composer.json` + `bootstrap/providers.php`, and the feature is gone.
Nothing outside those four references knows it existed — the block mounts
itself into the PDP rather than filling a placeholder in the catalog module's
markup.

## What it claims, and what it doesn't

`source` decides the heading:

| `source`       | heading                       | when                                            |
|----------------|-------------------------------|-------------------------------------------------|
| `behavioural`  | *Frequently bought together*  | ≥ 5 distinct **paid** orders contain the pair    |
| `curated`      | *Goes well together*          | otherwise — a merchant pairing, reason shown     |

"Frequently bought together" is a statement about other customers. On a
storefront with three demo orders it would be false, so it is not printed. The
curated pairings each carry a `reason` in the customer's own terms, and a
bundle without one fails the seeder rather than reaching a page.

Only **paid** orders count toward the behavioural threshold. A pending or
abandoned checkout is an intention, not a purchase — and if abandoned baskets
voted, anyone could manufacture a pairing by starting checkouts.

## The saving is real money

There is no bundle discount. The figure is the sum of `originalPrice − price`
across the ticked items — a saving the catalogue already carries and the
checkout already charges. A "bundle price" would mean either showing a total the
cart will not honour, or teaching the promotions engine a rule the server does
not enforce.

## Minimum order quantities

Industrial parts are priced per unit *at their MOQ* — the first price tier and
the listed price are the same number. So one tick of the tactile switch is 1,000
units, not one, and the line total, the saving and what lands in the cart all
use that quantity. Building this surfaced three related bugs that are now fixed:
the PDP stepper started at 1 for a 1,000-unit minimum, four `addToCart` call
sites dropped `moq` on the floor, and the cart clamped every line to 99.

## Layout

`.bundle__items` is a CSS grid with `repeat(auto-fit, minmax(210px, 1fr))`, so
every card is the same width at every viewport and a wrapped last row lines up
with the one above it. There is no breakpoint deciding a column count. An
earlier flex version with `+` separators between the cards wrapped a five-item
bundle into four-plus-one-orphan; the separators' own width was the problem, so
they went.

## Where things live

```
modules/bundle/
  bundle.js                  renders + mounts the block on the PDP
  bundle.css                 owns nothing outside .bundle
  data/bundles.json          THE curated pairings (also seeds the table)
  backend/
    api.js                   frontend seam — swap the fetch, nothing else changes
    endpoints.md             the HTTP contract
    routes.php               GET /api/bundles/{sku}
    BundleServiceProvider.php
    Controllers/BundleController.php
    Services/BundleService.php    which source, and what it may be called
    Models/ProductBundle.php
    Migrations/ Seeders/
```

## Dependencies

- **catalog** — product lookup (`getProductById` / `Product`)
- **cart** — via `shared/js/core/state.js` `addToCart`
- reads checkout's `order_items` table for the co-purchase count, but imports no
  class from it and guards with `Schema::hasTable`, so removing checkout
  degrades this to curated pairings instead of breaking every product page.

Nothing depends on `bundle`.
