# GulfRabit

**Premium import marketplace for Bangladesh.** Imported foods, electronics & gadgets,
kitchen & home, fashion, beauty, and industrial raw materials (PCBs, switches, relays,
polymers) — one storefront, two audiences (retail shoppers + B2B procurement).

> Shop Smart. Hop Fast.

---

## What this is

A hand-built, **content-first** storefront. The pages are real, semantic HTML —
JavaScript is used only to *enhance* (animations, interactions, cart state, mega-menu,
scroll reveal), never to render core content. This keeps the site fast, SEO-friendly,
and functional even with JS disabled.

- **HTML5** — semantic, accessible, written by hand.
- **Tailwind CSS** (CDN) — utility layout/spacing, configured with the GulfRabit palette.
- **Bootstrap 5** (CDN) — grid + a few JS behaviours (offcanvas, collapse) only; all
  visible surfaces are re-skinned so nothing looks "Bootstrap default".
- **Custom `style.css`** — CSS variables, brand gradient, elevation system, animations.
- **Vanilla JS (ES modules)** — small single-purpose modules for enhancement.
- **No framework, no jQuery.** Mock data via JSON + `localStorage`.

## Architecture — modular, folder-wise, independent

Every feature lives in its own self-contained folder under `modules/`, and each carries
**both its frontend and its backend contract**:

```
modules/<feature>/
├── <feature>.html      → the page(s) for this feature (real HTML content)
├── <feature>.css       → styles scoped to this feature
├── <feature>.js        → enhancement/behaviour for this feature
├── README.md           → what the module is and how it wires up
└── backend/
    ├── api.js          → data access for this feature (mock now → real API later)
    └── endpoints.md    → the REST contract the Laravel backend will fulfil
```

Cross-cutting concerns live once in `shared/` (design system, header/footer, cart state,
toasts, utilities) and are reused by every module.

```
gulfrabit/
├── index.html          → Home (loads the home module)
├── shared/             → design system + reusable components + core JS
├── assets/             → logo, icons, images, fonts
├── data/               → mock JSON catalog (products, categories, users, orders)
└── modules/            → one folder per feature (see above)
```

## Running locally

It's a static site — serve the folder with any static server so ES modules and `fetch()`
of the JSON work (opening files via `file://` blocks module imports):

```bash
# Python
python -m http.server 5173

# or Node
npx serve .
```

Then open <http://localhost:5173>.

## Backend (later)

The frontend is designed to slot onto **Laravel 12 / PHP 8.4 / MySQL / Redis** with a
REST API + JWT auth. Each module's `backend/endpoints.md` documents the exact endpoints
that will replace its mock `api.js`. Swapping mock → real means editing one file per
module, not the whole codebase.

See [`context.md`](context.md) for the full brand system, sitemap, decision log, and
build checklist.
