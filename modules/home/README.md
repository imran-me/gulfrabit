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
- **Section shapes:** `home-layout.js` reads the arrangement the merchant chose
  (Appearance → Home layout, owned by `modules/theme`) and stamps it on `<html>`
  as `data-lay="category:loop trust:static …"`, already resolved for the
  viewport. `marquee.js` is the one implementation of a row that travels
  right-to-left — used by the trust strip, the category tiles, the origins row
  and the testimonials.

## Backend
- `backend/endpoints.md` — the composed "collections" this page needs.
- `backend/api.js` — thin wrapper over the shared `data-service` today; becomes
  the home-collections API client later.

## Notes
- Product *lists* are rendered client-side (catalog data is dynamic); everything
  structural stays in HTML for SEO and no-JS resilience.
- A section's *shape* is a setting, but its **defaults are the page as authored**
  — no attribute means the arrangement in `index.html`. Adding a shape means a
  rule in `home.css`, an entry in `HomeLayout::SECTIONS` and its two client
  copies, and an `<option>` on the admin screen.
- **The -50% rule.** Every looping section duplicates its track and translates it
  −50%, so spacing must live on the item as `margin-inline-end`, never as the
  flex `gap`: n items give n−1 gaps, and the loop then hitches once per cycle.
