# Module · Catalog

Browsing and discovery: category listing (PLP), product detail (PDP), and search.

## Pages
| Page | File | Fragment | JS |
|---|---|---|---|
| Category / PLP | `category.html` | `_fragments/category.main.html` | `category-page.js` |
| Product / PDP | `product.html` | `_fragments/product.main.html` | `product-page.js` |
| Search | `search-results.html` | `_fragments/search.main.html` | `search-page.js` |

`*.html` are **generated** by the author-time assembler (see repo README /
`context.md`): each = canonical header/footer + the module fragment. Edit the
fragment, not the generated HTML.

## Styles
`catalog.css` — PLP grid + filters, PDP gallery/tabs/spec-table, chips.

## Shared components used
`product-card`, `filters-sidebar`, `skeleton-loader`, `quantity-stepper`,
`quick-view-modal`, `wishlist`, plus `data-service` + `router-helpers`.

## Behaviour notes
- URL is the source of truth: `?slug=`, `?id=`, `?q=`, and filter/sort state
  are mirrored into the query string (shareable, back-button friendly).
- Industrial/B2B products render a **spec-sheet table** + datasheet + MOQ hint
  instead of lifestyle copy.

## Backend
`backend/endpoints.md` + `backend/api.js` — products/categories/search/reviews.

---

## Backend (Laravel) — authored 2026-07-26

Follows the reference shape in `modules/delivery/`. **Not executed** — `php` and
`composer` are not installed on the authoring machine (see `BACKEND.md`).

```
backend/
├── CatalogServiceProvider.php   registers routes + migrations from in here
├── routes.php                   /api/catalog — the whole routing surface
├── endpoints.md                 the contract
├── Controllers/                 Product + Category (thin: HTTP shaping only)
├── Requests/ProductIndexRequest.php   whitelists `sort`; caps `perPage` at 60
├── Services/ProductQueryService.php   every filter/sort/search rule
├── Models/{Product,Category}.php      + toStorefrontArray()
├── Migrations/                  categories, products
└── Seeders/CatalogSeeder.php    seeds FROM data/*.json
```

### Data ownership

`data/products.json` and `data/categories.json` moved **into this module** on
2026-07-26. Products and categories are the catalog's, not a global bucket's.
`data/orders.json` and `data/users.json` stay at the root until the `account`
and `auth` modules take ownership of them.

Three tools were repointed with the move — `shared/js/core/data-service.js`,
`tools/gen-product-images.py`, `tools/sitemap.py`. The sitemap one broke first
and was caught by running it, not by grep; it builds its path from parts.

### Decisions worth knowing

- **Money is integer poisha.** `price_poisha`, `original_price_poisha`. Taka is
  presentation only, produced by `priceTaka()`.
- **`original_price_poisha` is NULL when not discounted**, never equal to price
  — otherwise the UI cannot distinguish "no discount" from "0% off".
- **Filtering and sorting run in SQL.** The mock frontend filters an in-memory
  array because it has 44 SKUs; the server must not.
- **`sort` is whitelisted**, not passed through. It reaches an `ORDER BY`.
- **Bound on `sku`/`slug`**, never the auto-increment id, in URLs and payloads.
- `specs`, `tags`, `dietary`, `images`, `price_tiers` are JSON columns. If tag
  filtering ever needs an index, promote `tags` to a pivot table rather than
  reaching for JSON path queries.

### Known gap

`/products` does not yet return **facet counts**. The sidebar derives brand and
origin counts client-side from the loaded set — correct at 44 SKUs, wrong at
scale. When the endpoint grows a `facets` block, `filters-sidebar.js` should
read it instead of counting.
