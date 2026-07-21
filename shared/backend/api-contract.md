# GulfRabit · Backend API Contract (shared)

> The frontend is built against this contract **today** using mock JSON in
> `/data` (served by `shared/js/core/data-service.js`). When the backend is
> built, implement these endpoints and flip `data-service.js` from reading JSON
> to calling the API — **no page or component changes required**.

## Target stack (later)

Laravel 12 · PHP 8.4+ · MySQL · Redis (cache/sessions) · REST + JWT auth.
Admin dashboard for inventory & order management.

## Conventions

- Base URL: `https://api.gulfrabit.com/v1`
- JSON in / JSON out. `Content-Type: application/json`.
- Auth: `Authorization: Bearer <JWT>` on protected routes.
- Money: integers/decimals in **BDT** (frontend formats via `format-currency.js`).
- Errors: `{ "error": { "code": "string", "message": "human text", "fields": {} } }`
  with an appropriate HTTP status (400/401/403/404/422/500).
- Pagination: `?page=1&perPage=24` → `{ data: [...], meta: { total, page, perPage } }`.

## Resource shapes

A **product** matches `data/products.json` exactly (id, title, brand, origin,
categorySlug, categoryName, price, originalPrice, image, images[], rating,
reviewCount, inStock, tags[], shortDescription, description, specs?, moq?,
priceTiers?, datasheet?, dietary?, createdAt).

A **category** matches `data/categories.json` (slug, name, icon, image,
audience, blurb, children[]).

## Endpoints (per module)

Each module documents the endpoints it owns in `modules/<x>/backend/endpoints.md`:

| Module   | Owns |
|----------|------|
| catalog  | products, categories, search, suggestions, reviews |
| cart     | cart read/write (server cart once authed), promo codes |
| checkout | shipping quotes, order creation, **payment gateway** |
| account  | profile, orders, addresses (CRUD), wishlist |
| auth     | register, login, logout, refresh, forgot/reset password |
| b2b      | RFQ submission, tiered pricing, datasheet links |
| content  | contact form, newsletter, FAQ (optionally CMS-driven) |
| home     | featured/curated collections (composed from catalog) |

## The single swap point

`shared/js/core/data-service.js` is the only file that knows how data is
fetched. Today it does `fetch('/data/products.json')`; tomorrow it does
`fetch(API_BASE + '/products')` with an auth header. Everything else consumes
its exported functions. Keep it that way.

## Not built yet (hooks only) — see context.md §8

- Real auth/session (currently `localStorage` mock; `// TODO: backend`).
- Real payment gateway at checkout (`// TODO: connect to payment gateway`).
- Server-side validation mirroring `utils/validate-form.js`.
- CMS for products/categories/content.
- Multi-language (bn/en/ar).
