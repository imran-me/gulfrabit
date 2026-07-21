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
| Home | `index.html` → `modules/home/` | home | NOT STARTED |
| Category / PLP | `modules/catalog/category.html` | catalog | NOT STARTED |
| Product / PDP | `modules/catalog/product.html` | catalog | NOT STARTED |
| Search results | `modules/catalog/search-results.html` | catalog | NOT STARTED |
| Cart | `modules/cart/cart.html` | cart | NOT STARTED |
| Checkout | `modules/checkout/checkout.html` | checkout | NOT STARTED |
| Order confirmation | `modules/checkout/order-confirmation.html` | checkout | NOT STARTED |
| Account dashboard | `modules/account/dashboard.html` | account | NOT STARTED |
| Account orders | `modules/account/orders.html` | account | NOT STARTED |
| Account addresses | `modules/account/addresses.html` | account | NOT STARTED |
| Account wishlist | `modules/account/wishlist.html` | account | NOT STARTED |
| Login | `modules/auth/login.html` | auth | NOT STARTED |
| Register | `modules/auth/register.html` | auth | NOT STARTED |
| Forgot password | `modules/auth/forgot-password.html` | auth | NOT STARTED |
| About | `modules/content/about.html` | content | NOT STARTED |
| Contact | `modules/content/contact.html` | content | NOT STARTED |
| FAQ | `modules/content/faq.html` | content | NOT STARTED |
| Shipping & Returns | `modules/content/shipping-returns.html` | content | NOT STARTED |
| 404 | `modules/content/404.html` | content | NOT STARTED |
| B2B Industrial | `modules/b2b/b2b-industrial.html` | b2b | NOT STARTED |

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

| Component | Path | Purpose |
|---|---|---|
| _(none yet)_ | | |

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
- [ ] Link Bootstrap 5 + Tailwind (brand colours) + fonts (done per-page in header)
- [ ] Prepare logo assets (dark-bg supplied; produce light-bg transparent PNG)
- [ ] Build `_variables.css` with every `--gr-*` token

### Phase 1 — Design system & shared components
- [ ] `_typography.css`, `_buttons.css`, `_cards.css`, `_animations.css` + other partials
- [ ] `header.html` partial + `header-nav.js` (mega-menu + mobile offcanvas + sticky glass)
- [ ] `footer.html` partial
- [ ] `product-card.js` (enhancement for HTML-authored cards)
- [ ] `cart-drawer.js` + `state.js` (cart logic on localStorage)
- [ ] `toast-notifications.js`
- [ ] `scroll-reveal.js`
- [ ] `skeleton-loader.js`
- [ ] `data/products.json` + `categories.json` covering ALL verticals
- [ ] `data-service.js` + per-module `backend/api.js`

### Phase 2 — Core shopping pages
- [ ] `index.html` (home)
- [ ] `catalog/category.html` (filters/sort)
- [ ] `catalog/product.html` (gallery, tabs, add-to-cart/wishlist)
- [ ] `catalog/search-results.html` + `search-autocomplete.js`
- [ ] `cart/cart.html`

### Phase 3 — Checkout & account
- [ ] `checkout/checkout.html` multi-step + validation
- [ ] `checkout/order-confirmation.html`
- [ ] `auth/{login,register,forgot-password}.html`
- [ ] `account/{dashboard,orders,addresses,wishlist}.html`

### Phase 4 — Content & edge pages
- [ ] `content/{about,contact,faq,shipping-returns}.html`
- [ ] `content/404.html`
- [ ] `b2b/b2b-industrial.html` (RFQ form + spec-sheet products)

### Phase 5 — Polish pass
- [ ] Verify 5 breakpoints on every page
- [ ] Verify "expensive design" rules (spacing/radius/shadow/colour-ratio/hover)
- [ ] Accessibility pass (contrast, focus, alt, keyboard)
- [ ] Empty + loading states on every data-driven page
- [ ] Final context.md update + backend integration notes

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
