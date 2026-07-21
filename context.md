# GulfRabit — Project Context

> **Persistent build memory.** Re-read this in full at the start of every session.
> Update it continuously — todo checkboxes, file tree, decision log, change log.
> If anything deviates from the master prompt, record *why* in the Decision Log.

---

## 1. Brand Identity

**Logo:** Geometric low-poly rabbit head/ears in a cyan→lime gradient on black, bold
rounded "GulfRabit" wordmark, Arabic tagline, and "Shop Smart. Hop Fast." beneath.
Reads premium, tech-forward, fast — faceted glass/gem, not cartoonish.
Source asset: `assets/logo/gulfrabit-logo-dark-bg.jpeg` (single source of truth — never
recreate the mark in CSS/SVG).

**Colour palette (exact values → `shared/css/partials/_variables.css`):**

| Token | Value | Use |
|---|---|---|
| `--gr-cyan` | `#1BB4D4` | primary brand — CTAs, links, active states |
| `--gr-cyan-dark` | `#0E7C99` | hover/pressed, deep accents, gradient |
| `--gr-lime` | `#9ACD3C` | secondary — highlights, success/sale badges |
| `--gr-lime-light` | `#C3E86B` | light accents, gradient partner |
| `--gr-black` | `#0A0A0A` | primary background (warm black) |
| `--gr-charcoal` | `#151515` | card/section backgrounds on black |
| `--gr-graphite` | `#1F1F1F` | elevated surfaces, inputs |
| `--gr-border` | `#2A2A2A` | hairline borders on dark |
| `--gr-white` | `#FFFFFF` | text on dark / light-section bg |
| `--gr-off-white` | `#F7F8F7` | light-mode section backgrounds |
| `--gr-ink` | `#101314` | text on light |
| `--gr-gray-500` | `#8A8F8C` | secondary/muted text |
| `--gr-gray-300` | `#D8DBD9` | dividers on light |
| `--gr-success` | `#9ACD3C` | reuse lime |
| `--gr-error` | `#E5484D` | errors |
| `--gr-warning` | `#E8B342` | warnings |
| `--gr-gold-accent` | `#C9A24B` | ONLY Premium/Imported/VIP luxury micro-details |

**Brand gradient:** `linear-gradient(135deg, #1BB4D4 0%, #9ACD3C 100%)` — accents only
(hero overlays, premium badges, active nav underline, newsletter band). Never a full-page
background.

**80/20 rule:** canvas is near-black + off-white; cyan/lime are *accents*. If a page
looks colourful, there's too much brand colour.

**Typography:**
- Display/Headings (H1–H3): "Clash Display" / "General Sans" (Fontshare), weight 600–700.
- Body: "Inter" (Google Fonts), 400/500.
- Prices/numerals: Inter + `font-variant-numeric: tabular-nums`.
- Arabic fallback: `'Inter', 'Noto Kufi Arabic', sans-serif`.
- Type scale (1.25 ratio): 12 / 14 / 16 / 20 / 25 / 31 / 39 / 49px. Never ad-hoc sizes.

**Voice:** Confident, precise, uncluttered. Short sentences. No exclamation hype.
"Sourced. Verified. Delivered." not "Best Price Guaranteed!!". Title case categories,
ALL CAPS only for small tags/badges.

**Currency:** BDT — `৳ 12,500` (tabular-nums).

---

## 2. Tech Stack & Constraints

- Content-first **HTML5**, semantic + ARIA. **JS enhances, never renders core content.**
- **Tailwind CSS** (CDN) configured with brand palette (`bg-gr-cyan`, `text-gr-lime`…).
- **Bootstrap 5** (CDN) — grid + offcanvas/collapse JS only; everything re-skinned.
- **Custom `shared/css/style.css`** — imports partials, holds `:root` variables.
- **Vanilla JS ES modules** — small, single-purpose. No framework, no jQuery.
- **No backend yet** — mock JSON in `/data`, persisted via `localStorage`/`sessionStorage`.
  Data access isolated so mock→real API = edit one file per module.
- **Responsive, mobile-first.** Breakpoints: 375 / 768 / 1024 / 1440 / 1920.
- **Accessibility:** contrast-checked (cyan-on-black ✔, lime-on-white ✘ → use `--gr-ink`),
  keyboard nav, visible `:focus`, alt text on all images, lazy-load images.
- **Future backend:** Laravel 12 / PHP 8.4 / MySQL / Redis / REST + JWT.

**Hard rule:** one page = one HTML file in its module; one feature = one JS module; one
style concern = one CSS partial. Split any file over ~300 lines.

---

## 3. Sitemap (status)

| Page | File | Module | Status |
|---|---|---|---|
| Home | `index.html` → `modules/home/` | home | DONE |
| Category / PLP | `modules/catalog/category.html` | catalog | DONE |
| Product / PDP | `modules/catalog/product.html` | catalog | DONE |
| Search results | `modules/catalog/search-results.html` | catalog | DONE |
| Cart | `modules/cart/cart.html` | cart | DONE |
| Checkout | `modules/checkout/checkout.html` | checkout | DONE |
| Order confirmation | `modules/checkout/order-confirmation.html` | checkout | DONE |
| Account dashboard | `modules/account/dashboard.html` | account | DONE |
| Account orders | `modules/account/orders.html` | account | DONE |
| Account addresses | `modules/account/addresses.html` | account | DONE |
| Account wishlist | `modules/account/wishlist.html` | account | DONE |
| Login | `modules/auth/login.html` | auth | DONE |
| Register | `modules/auth/register.html` | auth | DONE |
| Forgot password | `modules/auth/forgot-password.html` | auth | DONE |
| About | `modules/content/about.html` | content | DONE |
| Contact | `modules/content/contact.html` | content | DONE |
| FAQ | `modules/content/faq.html` | content | DONE |
| Shipping & Returns | `modules/content/shipping-returns.html` | content | DONE |
| 404 | `modules/content/404.html` | content | DONE |
| B2B Industrial | `modules/b2b/b2b-industrial.html` | b2b | DONE |

---

## 4. File & Folder Structure (live)

```
gulfrabit/
├── context.md · README.md · .gitignore
├── index.html                          (home shell)
├── assets/  logo/ icons/ images/{products,categories,hero}/ fonts/
├── data/    products.json categories.json users.json orders.json
├── shared/
│   ├── css/style.css + partials/{_variables,_typography,_buttons,_cards,
│   │        _navigation,_forms,_modals-offcanvas,_animations,_utilities}.css
│   ├── js/core/{data-service,storage,state,router-helpers}.js
│   ├── js/components/{header-nav,cart-drawer,toast-notifications,scroll-reveal,
│   │        product-card,quantity-stepper,search-autocomplete,skeleton-loader,
│   │        newsletter-signup,wishlist}.js
│   ├── js/utils/{format-currency,validate-form,debounce}.js
│   ├── components/{header.html,footer.html}   (canonical partials)
│   └── backend/{api-contract.md}
└── modules/<feature>/ { <feature>.html, .css, .js, README.md, backend/{api.js,endpoints.md} }
```
_(update whenever files are added)_

---

## 5. Component Inventory

**Core (`shared/js/core/`):** `storage` (namespaced, safe localStorage/session
wrapper) · `state` (observable cart/wishlist/user store, cross-tab sync) ·
`data-service` (single data access point → future REST API) · `router-helpers`
(query-param read/write).

**Components (`shared/js/components/`):**

| Component | Path | Purpose |
|---|---|---|
| header-nav | `components/header-nav.js` | sticky glass, mega-menu, mobile drawer, count badges, search overlay |
| cart-drawer | `components/cart-drawer.js` | self-contained offcanvas mini-cart |
| product-card | `components/product-card.js` | canonical card markup + behaviour enhancer |
| filters-sidebar | `components/filters-sidebar.js` | facets from a product set + mobile bottom-sheet |
| quick-view-modal | `components/quick-view-modal.js` | lazy-loaded product peek |
| search-autocomplete | `components/search-autocomplete.js` | debounced suggestions |
| quantity-stepper | `components/quantity-stepper.js` | reusable qty control (emits `qty:change`) |
| toast-notifications | `components/toast-notifications.js` | non-blocking confirmations |
| scroll-reveal | `components/scroll-reveal.js` | IntersectionObserver reveal (+ stagger) |
| skeleton-loader | `components/skeleton-loader.js` | shimmer placeholders |
| newsletter-signup | `components/newsletter-signup.js` | validated newsletter band |
| wishlist | `components/wishlist.js` | standalone wishlist toggle buttons |

**Utils (`shared/js/utils/`):** `format-currency` (BDT) · `validate-form`
(declarative, data-attribute driven) · `debounce`.

**Partials (`shared/components/`):** `header.html`, `footer.html` (canonical,
inlined into pages by `tools/assemble.py`).

---

## 6. Decision Log

- **2026-07-21** — **Modular `modules/<feature>/` architecture** (not flat `/pages`).
  Reason: user requires fully modular, folder-wise, independent features each carrying
  frontend + backend. Reconciles both master prompts under one explicit constraint.
- **2026-07-21** — **Content-first HTML; JS only enhances.** Reason: user: "No js oriented
  site … js for advancements, animations, effects, and styles." Header/footer written as
  real HTML per page (SEO + no-JS resilience), not injected by JS.
- **2026-07-21** — **Tailwind + Bootstrap via CDN** (no local build pipeline yet). Reason:
  dev mode per master prompt; keep `/src`-vs-`/dist` mental separation for later.
- **2026-07-21** — Logo kept as `.jpeg` source; a transparent light-bg PNG is flagged as a
  to-prepare asset (Known Issues).

---

## 7. TO-DO LIST (master checklist)

### Phase 0 — Setup
- [x] Create context.md with full sections
- [x] Set up modular folder structure
- [x] Link Bootstrap 5 + Tailwind (brand colours) + fonts (done per-page in head)
- [~] Prepare logo assets (dark-bg supplied; light-bg transparent PNG still TODO)
- [x] Build `_variables.css` with every `--gr-*` token

### Phase 1 — Design system & shared components
- [x] `_typography.css`, `_buttons.css`, `_cards.css`, `_animations.css` + other partials
- [x] `header.html` partial + `header-nav.js` (mega-menu + mobile offcanvas + sticky glass)
- [x] `footer.html` partial
- [x] `product-card.js` (canonical markup + enhancement for HTML-authored cards)
- [x] `cart-drawer.js` + `state.js` (cart logic on localStorage)
- [x] `toast-notifications.js`
- [x] `scroll-reveal.js`
- [x] `skeleton-loader.js`
- [x] `data/products.json` (31) + `categories.json` (9) covering ALL verticals
- [x] `data-service.js` + per-module `backend/api.js`

### Phase 2 — Core shopping pages
- [x] `index.html` (home)
- [x] `catalog/category.html` (filters/sort, URL-synced, load-more, empty state)
- [x] `catalog/product.html` (gallery, tabs, add-to-cart/wishlist, spec-sheet for B2B)
- [x] `catalog/search-results.html` + `search-autocomplete.js`
- [x] `cart/cart.html` (editable, promo, save-for-later)

### Phase 3 — Checkout & account
- [x] `checkout/checkout.html` multi-step + validation
- [x] `checkout/order-confirmation.html`
- [x] `auth/{login,register,forgot-password}.html`
- [x] `account/{dashboard,orders,addresses,wishlist}.html`

### Phase 4 — Content & edge pages
- [x] `content/{about,contact,faq,shipping-returns}.html`
- [x] `content/404.html`
- [x] `b2b/b2b-industrial.html` (RFQ form + spec-sheet products, tiered pricing, MOQ)

### Phase 5 — Polish pass
- [x] Nav breakpoint gap fixed (992/1024); mobile filters bottom-sheet (live host)
- [x] "Expensive design" rules applied (8px grid, 2 radii, 3 shadows, 80/20 colour)
- [x] Accessibility: visible focus, alt text, ARIA, keyboard nav, skip link, reduced-motion
- [x] Empty + loading (skeleton) states on data-driven pages
- [x] All 20 pages verified 200 via static server
- [ ] Manual visual QA across 375/768/1024/1440/1920 in a real browser (recommended next)
- [x] Final context.md update + backend integration notes

---

## 8. Known Issues / Follow-ups

- Light-bg **transparent PNG logo** not yet produced (source is `.jpeg` on black). Flag.
- **Backend integration point:** each `modules/*/backend/api.js` currently reads mock JSON
  / localStorage. Replace with Laravel REST calls (`endpoints.md` per module).
- **Payment gateway** at checkout is UI-only — `// TODO: connect to payment gateway`.
- **Auth/session** mocked via localStorage — replace with JWT.
- **Product imagery** uses placeholders — swap for real photography with vignette treatment.
- **Multi-language** (Bangla/English/Arabic) — font stack ready; not wired.

---

## 9. Change Log

- **2026-07-21** — Repo initialised; remote set to github.com/imran-me/gulfrabit.
  Created modular folder structure, `.gitignore`, `README.md`, `context.md`. Copied logo
  to `assets/logo/`. Began Phase 0/1 design-system foundation.
- **2026-07-21** — Built the full design system (`shared/css`), the shared JS core +
  components + utils, mock data (31 products / 9 categories / users / orders), brand-
  consistent SVG placeholder imagery, and the canonical header/footer partials.
- **2026-07-21** — Added `tools/assemble.py` (author-time page composer: header/footer
  partials + module fragments → static HTML). Decision: `index.html` hand-authored; all
  other pages generated — **edit the fragment, not the generated `.html`.**
- **2026-07-21** — Shipped ALL 20 pages across home, catalog, cart, checkout, account,
  auth, content and B2B modules, each with a `backend/` contract (`endpoints.md` + mock
  `api.js`). Every module is self-contained (frontend + backend seam).
- **2026-07-21** — Phase 5 polish: fixed the 992–1024px nav dead-zone (desktop nav now
  appears at 992 to match the hamburger); reworked the mobile filters bottom-sheet to
  relocate the live filter host (no dead clone). Verified all pages return 200.
- **2026-07-21** — All commits authored as **Md Imran Hossain** (no Claude co-author),
  pushed to `origin/main` incrementally per phase.
