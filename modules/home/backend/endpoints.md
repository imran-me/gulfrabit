# Home · Backend endpoints

The home page composes existing catalog data into merchandising collections.

| Method | Path | Purpose | Replaces (mock) |
|---|---|---|---|
| GET | `/home/collections` | `{ premium:[], bestsellers:[], newArrivals:[] }` in one call | 3× `getFeatured()` over `products.json` |
| GET | `/home/hero` | hero slides (image, eyebrow, title, cta) — CMS-driven | hard-coded HTML slides |
| GET | `/home/testimonials` | approved testimonials | hard-coded HTML |

Notes
- `/home/collections` should be cacheable (Redis, short TTL) — it's the busiest call.
- Hero slides and testimonials are good first CMS candidates.
- Product objects use the shared product shape (see `shared/backend/api-contract.md`).
