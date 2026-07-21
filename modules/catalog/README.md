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
