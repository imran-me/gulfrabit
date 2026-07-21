# Content · Backend endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/contact` | contact form submission (validate + spam guard + email) |
| POST | `/newsletter/subscribe` | newsletter opt-in (double opt-in recommended) |
| GET | `/content/faq` | FAQ items (optionally CMS-managed) |
| GET | `/content/pages/{slug}` | policy pages (about, shipping-returns) if CMS-driven |

Notes
- Contact + newsletter need server-side validation and rate-limiting.
- About / Shipping are static HTML today; move to a CMS only if editors need it.
