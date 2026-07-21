# Catalog · Backend endpoints

| Method | Path | Purpose | Replaces (mock) |
|---|---|---|---|
| GET | `/products` | list w/ `?category=&sort=&minPrice=&maxPrice=&brands=&origins=&tags=&rating=&inStock=&page=&perPage=` | `getProductsByCategory` / filters |
| GET | `/products/{id}` | single product (full detail + specs) | `getProductById` |
| GET | `/products/{id}/related` | related products | `getRelated` |
| GET | `/categories` | category tree | `getCategories` |
| GET | `/categories/{slug}` | one category | `getCategoryBySlug` |
| GET | `/search?q=&…` | full-text search + facets | `searchProducts` |
| GET | `/suggest?q=` | autocomplete suggestions | `suggest` |
| GET | `/products/{id}/reviews` | paginated reviews | mock summary |
| POST | `/products/{id}/reviews` | submit a review (auth) | — |

Notes
- Server should return **facet counts** alongside results so the sidebar can show
  counts per brand/origin without client-side derivation.
- Filtering/sorting/pagination move server-side; `category-page.js` already models
  the same params, so wiring is a data-service swap.
