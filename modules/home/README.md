# Module · Home

The storefront landing experience (`/index.html`).

## Frontend
- **Markup:** `/index.html` (content-first: hero copy, category grid, industry
  band, testimonials, newsletter are all real HTML).
- **Styles:** `home.css` (hero carousel, trust strip, industry band, testimonials,
  newsletter band). Reuses the shared design system.
- **Behaviour:** `home.js` — hero carousel, testimonials slider, rail arrows, and
  filling the product lists (Premium / Best Sellers / New Arrivals) from
  `data-service` with skeleton loaders.

## Backend
- `backend/endpoints.md` — the composed "collections" this page needs.
- `backend/api.js` — thin wrapper over the shared `data-service` today; becomes
  the home-collections API client later.

## Notes
- Product *lists* are rendered client-side (catalog data is dynamic); everything
  structural stays in HTML for SEO and no-JS resilience.
