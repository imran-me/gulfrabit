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

> **⚠ Read this before using the table above.** Since 2026-07-25 the site renders on a
> **white canvas**, so the neutral rows are no longer what the UI paints with — the
> "primary background" is `--surface-page` (#FFFFFF), not `--gr-black`. The palette
> above is kept as the *brand* record; the *roles* below are what you actually use.
>
> | Role | Value | Use |
> |---|---|---|
> | `--surface-page` | `#FFFFFF` | the page canvas |
> | `--surface-raised` | `#FFFFFF` | cards, menus, modals, drawers (+ hairline) |
> | `--surface-sunken` | `#F4F6F5` | inputs, image wells, hovered rows |
> | `--surface-band` | `#F7F8F7` | alternating section bands, footer |
> | `--border-hairline` | `#E5E9E7` | dividers, card outlines |
> | `--border-input` | `#808A85` | form controls (meets 3:1) |
> | `--text-primary` | `#101314` | headings + body |
> | `--text-secondary` | `#414B47` | supporting copy, labels |
> | `--text-muted` | `#667069` | captions, meta |
> | `--link` / `--link-hover` | `#0E7C99` / `#0A5F76` | links, overlines, meaningful icons |
> | `--lime-ink` | `#547C10` | stars, success text |
> | `--gold-ink` | `#8A6D22` | premium/VIP text |
>
> **Contrast rule:** `--gr-cyan` (2.5:1) and `--gr-lime` (1.9:1) FAIL against white.
> Use them for fills, borders and glows only — never for text or meaningful icons.

**Brand gradient:** `linear-gradient(135deg, #1BB4D4 0%, #9ACD3C 100%)` — accents only
(hero overlays, premium badges, active nav underline, newsletter band). Never a full-page
background. For **display type** use `--gr-gradient-ink` (#0E7C99 → #4E7A0F) — the raw
gradient is unreadable as text on white.

**80/20 rule:** canvas is white + off-white bands; cyan/lime are *accents*. If a page
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

## 2. Architecture — LOCKED. Read before writing any code.

> These four rules are standing instructions from the project owner. They are not
> preferences to be re-litigated per task; **every** piece of work follows them.

**1. Frontend = plain, structured HTML.** Semantic + ARIA. No templating engine on the
   client, no framework.
**2. Styling = CSS + Tailwind.** Design tokens and components in the CSS partials;
   Tailwind for utility composition.
**3. Effects, animation, motion and any special styling behaviour = JS.** Anything that
   moves, reveals, transitions or reacts is JS-driven; CSS holds the static look.
**4. Backend = Laravel (PHP).**

#### How the three styling layers divide — use all three

| Layer | Owns | Examples |
|---|---|---|
| **CSS partials** | design tokens, and any *named, reused component* | `.product-card`, `.btn-gr`, `.option-card`, `--surface-page` |
| **Tailwind utilities** | one-off layout and spacing on a single element | `flex items-center gap-3`, `mt-6`, `col-span-2`, `md:grid-cols-2` |
| **JS** | motion, reveal, transitions, state-driven visuals | `scroll-reveal.js`, cart-drawer open/close, badge/promo repaint |

**Audited 2026-07-26 — two things to correct as work continues:**

1. **Tailwind is loaded but generating nothing.** Exactly four Tailwind-shaped
   classes appear in the HTML (`text-muted-gr`, `select-gr`, `text-gradient`,
   `col-span-2`) and **all four are our own CSS classes**. The Play CDN ships a
   JIT compiler on every page for zero output.
2. **There are ~1,040 inline `style=""` attributes** — `style="margin-right:1rem"`,
   `style="color:var(--text-muted)"`, `style="font-size:var(--fs-14)"` and so on.
   **That is the work Tailwind should be doing.** Inline styles cannot be reused,
   cannot respond to a breakpoint, and beat every stylesheet on specificity.

**Rule going forward:** reach for a Tailwind utility before an inline `style`.
Promote to a CSS partial the moment the same combination appears three times.
Do not add new inline `style=""` for anything a utility expresses.

⚠ The **Play CDN is not production-safe** (Tailwind say so themselves). It stays
for now because there is no `node`/`npm` on this machine to run the Tailwind CLI.
Before a real launch: install the CLI, build one static stylesheet from
`shared/css/tailwind.config.js`, and drop the CDN `<script>`.

### The module rule — the one that matters most

**Every feature or section is ONE self-contained folder holding everything it needs:**
markup, styles, JS, controllers, routes, models, migrations, tests, docs.

> **The test:** deleting a module folder must cleanly remove that feature and break
> nothing else. If deleting it leaves orphaned routes, dangling CSS, or half-dead JS
> elsewhere, the module was built wrong.

Canonical layout — mirror this for every module:

```
modules/<feature>/
├── README.md              what this module owns, and its seams
├── <page>.html            generated page shell (built by tools/assemble.py)
├── _fragments/            <main> source that the assembler wraps
├── <feature>.css          styles scoped to this module
├── <feature>-page.js      behaviour, motion and effects
└── backend/               ← Laravel, colocated with the feature it serves
    ├── routes.php         this module's routes only
    ├── Controllers/       HTTP controllers
    ├── Models/            Eloquent models
    ├── Requests/          form-request validation
    ├── Services/          domain logic (thin controllers)
    ├── Migrations/        this module's schema
    ├── api.js             frontend data seam (mock today → HTTP later)
    └── endpoints.md       the contract, written before the code
```

Only genuinely **cross-cutting primitives** live in `shared/` — design tokens, currency
formatting, the storage wrapper, path resolution. If a change is about one feature, it
belongs in that feature's folder, not in `shared/`.

### Standard for all work

Build it the way an ultra-professional full-stack developer would: clear structure,
obvious naming, easy to understand, easy to edit and extend, **easy to hand to another
developer without explanation**. Handover quality is a requirement, not a bonus.

### Current state / constraints

- **Responsive, mobile-first.** Breakpoints: 375 / 768 / 1024 / 1440 / 1920.
- **Accessibility:** AA contrast on the white canvas (see §1 — raw cyan and lime FAIL as
  text; use `--link` / `--lime-ink` / `--gold-ink`), keyboard nav, visible `:focus`,
  alt text on all images, lazy-load images.
- **Bootstrap 5** (CDN) — grid + offcanvas/collapse JS only; fully re-skinned.
- **Data today:** mock JSON **owned by each module** (`modules/<feature>/data/`) and read
  through that module's `backend/api.js`, which is the single seam — swapping mock for a
  real endpoint touches that one file. The old global `/data` bucket was removed
  2026-07-26: catalog owns products + categories, account owns orders, auth owns users,
  delivery owns districts. The only shared piece is `core/json-cache.js`, a domain-free
  fetch-and-memoise helper.
- **Target backend:** Laravel 12 / PHP 8.4 / MySQL / Redis / REST + JWT.
- ⚠ **`php`, `composer`, `node` and `npm` are NOT installed on this machine**
  (checked 2026-07-26). Laravel code can be authored but **cannot be run or tested
  locally** until they are — never claim a PHP path was verified.

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
| Order tracking | `modules/account/track.html` | account | DONE |
| Deals & Offers | `modules/deals/deals.html` | deals | DONE |
| Compare | `modules/catalog/compare.html` | catalog | DONE |
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
├── context.md · README.md · BACKEND.md · .gitignore
├── composer.json                    PSR-4: Modules\<Feature>\ -> modules/<f>/backend/
├── artisan · .env.example · .htaccess · DEPLOY-HOSTINGER.md
├── app/         Models/User.php · Providers/AppServiceProvider.php
├── bootstrap/   app.php (enables the 'api' group) · providers.php (module list)
├── database/    migrations/ (users) · seeders/DatabaseSeeder.php
├── routes/      api.php (empty by design) · web.php · console.php
├── public/      index.php — Laravel front controller, /api ONLY
├── index.html · 404.html · sitemap.xml · robots.txt · site.webmanifest
├── assets/    logo/ icons/ images/{products,categories,hero}/ fonts/
├── research/  competitor-analysis.md · implementation-plan.md
├── tools/     assemble.py · gen-product-images.py · sitemap.py · qa-viewport.html
├── shared/                          ONLY cross-cutting primitives live here
│   ├── css/style.css + partials/{_variables,_typography,_buttons,_cards,
│   │        _navigation,_forms,_modals-offcanvas,_animations,_utilities}.css
│   ├── js/core/{json-cache,storage,state,paths,router-helpers}.js
│   ├── js/components/{header-nav,cart-drawer,toast-notifications,scroll-reveal,
│   │        product-card,quantity-stepper,search-autocomplete,skeleton-loader,
│   │        newsletter-signup,wishlist,compare-tray,quick-view-modal}.js
│   ├── js/utils/{format-currency,validate-form,debounce}.js
│   ├── components/{header.html,footer.html}   (canonical partials)
│   └── backend/api-contract.md
└── modules/<feature>/
    ├── README.md · <page>.html · _fragments/ · <feature>.css · <feature>-page.js
    ├── data/                        the datasets THIS module owns
    └── backend/
        ├── <Feature>ServiceProvider.php   registers routes + migrations from in here
        ├── routes.php · endpoints.md · api.js      (api.js = the frontend seam)
        └── Controllers/ Models/ Requests/ Services/ Migrations/ Seeders/
```

**Data ownership** (there is no global `/data` bucket — removed 2026-07-26):

| Dataset | Owner |
|---|---|
| `products.json`, `categories.json` | `modules/catalog/data/` |
| `orders.json` | `modules/account/data/` |
| `users.json` | `modules/auth/data/` |
| `districts.json` | `modules/delivery/data/` |

**Laravel layer status** — mirrored in `BACKEND.md`:

| Module | Laravel |
|---|---|
| `delivery` | authored — provider, routes, controller, request, service, 2 models, 2 migrations, seeder |
| `catalog` | authored — provider, routes, 2 controllers, request, query service, 2 models, 2 migrations, seeder |
| `cart` | authored — provider, routes, controller, 2 requests, 2 services, 3 models, 3 migrations, seeder |
| `checkout` | authored — provider, routes, controller, request, order service, 2 models, 2 migrations |
| `auth`, `account`, `b2b`, `deals`, `home`, `content` | not started — frontend runs on `backend/api.js` mocks |

**Module dependency graph** (verified one-way, no cycles):
`catalog` and `delivery` depend on nothing · `cart` → `catalog` · `checkout` → `cart`, `catalog`, `delivery`

⚠ **No PHP has been executed** — `php`/`composer` are not installed here.

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
- **2026-07-25** — **Site flipped from a near-black canvas to a WHITE canvas.** Reason:
  user request ("make my site white background"), and it matches the Bangladeshi
  e-commerce norm the reference sites (Shajgoj, Ghorer Bazar, Daraz) all follow.
  Implemented as a **semantic surface-role layer** in `_variables.css` rather than by
  editing hexes in place: the brand palette (§1) keeps its original, truthful values,
  and every partial/module now paints with roles (`--surface-page`, `--surface-raised`,
  `--surface-sunken`, `--surface-band`, `--border-hairline`, `--border-input`,
  `--text-primary/secondary/muted`). Re-theming the whole site is now one block.
- **2026-07-25** — **Brand hues re-cut for legibility on white.** `--gr-cyan` is 2.5:1 and
  `--gr-lime` 1.9:1 against white — both fail WCAG AA as text. The raw hues are still used
  for fills, borders and glows, but anything that *carries meaning* uses the ink variants:
  `--link` #0E7C99 (4.8:1), `--lime-ink` #547C10 (4.9:1), `--gold-ink` #8A6D22 (4.8:1).
  `.text-gradient` uses `--gr-gradient-ink`, since the raw cyan→lime gradient was
  unreadable as display type on white.
- **2026-07-25** — **Hero/footer stay light too** (no dark footer anchor). Reason: the ask
  was an unambiguous white site; a dark footer is a one-line change if wanted later.
- **2026-07-26** — **Architecture locked** (see §2): plain HTML + CSS/Tailwind + JS for
  motion, Laravel backend, and every feature as ONE self-contained module folder.
  Standing instruction from the project owner — applies to all work, not per task.
- **2026-07-26** — **`modules/delivery/` created as the reference vertical slice.**
  `shared/js/core/delivery.js` was deleted: delivery is a *feature*, not a cross-cutting
  primitive, so it had no business in `shared/`. The module now owns its Laravel layer
  (provider, routes, controller, request, service, models, migrations, seeder), its own
  `data/districts.json` (all 64 districts), the API contract, and the frontend seam.
  Four modules consume it through `backend/api.js` and nothing reaches past that.
  Mirror this folder when building any new feature.

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

### Phase 6 — Competitor-derived features (2026-07-25)

Derived from live teardowns of **Shajgoj**, **Ghorer Bazar** and **Daraz BD** —
see `research/competitor-analysis.md` (findings) and `research/implementation-plan.md`
(what to build, where, and why). Ordered by value per hour.

**Working rule for this phase:** build **one item at a time**, verify it 2–3× for
pixel accuracy, function, responsiveness (375/768/1024/1440/1920) and console
errors, and only then start the next. No parallel half-finished features.

- [x] **0.1** WhatsApp + Messenger pre-filled order CTAs on the PDP *(Ghorer Bazar)*
      — deep link carries title, price, SKU and absolute product URL. Links are
      **real HTML** (work with JS off); `product-page.js` only rewrites the message,
      and reads the phone number back out of the href so the number is written once.
      Messenger has no prefilled-text param — `m.me` only forwards `ref` — so it
      carries the product id. Verified: decoded message correct, no overflow at
      375/414/768, no console errors, no-JS fallback intact.
- [x] **0.4** Per-tender refund matrix on Shipping & Returns *(Daraz)* — bKash/Nagad 5
      working days, card 7–10 (the issuing bank owns the last step), COD → bKash/Nagad/bank
      you nominate. Linked from the PDP trust block and from the checkout payment step,
      because "when do I get my money back" is the question behind most COD hesitation.
      Under 560px the table **stacks into labelled blocks** rather than scrolling
      sideways — on a refund table the last column is the answer, so it must not be the
      one that gets hidden. Verified: no overflow at 375/414/768, no console errors.
- [x] **3.1** Barcode + country of origin in the PDP spec table *(Shajgoj)* —
      provenance is the product, so it must be checkable. The Specifications tab now
      leads with a **Product details** block (brand, country of origin, barcode,
      category, MOQ) for **every** product, then the technical sheet for industrial
      SKUs. This fixed a real bug: the old code branched on `p.specs` and industrial
      products fell down a specs-only path that **dropped origin entirely** — the one
      fact the brand promise rests on. All 44 products carry a mock EAN-13 with a
      valid check digit.
- [x] **1.4** One consistent delivery promise sitewide — flat **৳70** Dhaka & Chattogram
      (72 hours) / **৳130** rest of Bangladesh (4 working days) / **৳150** express Dhaka,
      *the same charge whatever the order is worth* **(Ghorer Bazar)**. Cold-chain is
      **included** on perishables, never a surcharge — the old ৳200 cold-chain option
      contradicted the banner on all 24 pages. Canonical values live in
      `modules/delivery/backend/api.js`; cart, checkout, its mock backend, order confirmation
      and order tracking all read from it, so they cannot drift again.
      **This fixed a real functional bug:** the banner and cart both promised "free
      delivery over ৳3,000" while checkout charged ৳60 unconditionally — there was no
      free-delivery logic in checkout at all. Verified: subtotal ৳4,550 + ৳70 = ৳4,620,
      three zone options correct, no module errors, no overflow at 375/414/768.
- [x] **4.2** Absolute savings ("Save ৳ 350") next to the percentage *(Shajgoj)* —
      `savingsLabel()` in `format-currency.js`, rendered on the product card, the PDP
      and quick-view. In BDT the absolute figure lands harder than the percent, because
      "19% off" needs arithmetic against a price the shopper has not memorised. Uses
      `--lime-ink` (4.9:1), never raw `--gr-lime` (1.9:1 on white).
      Also fixed a **pre-existing layout flaw this exposed**: `.price` now has
      `white-space: nowrap`, because `formatBDT` emits "৳ 1,450" with a real space and
      2-up cards at 375px were breaking the symbol onto its own line.
- [x] **4.1** Fixed badge slots, priority-ordered, capped at two *(Daraz)* —
      `productBadges(product, max)` in `product-card.js` is the one source; the card
      takes 2 slots, the roomier PDP takes 3. Priority is by decision weight:
      **sold-out** (returns alone — nothing else matters if you can't buy it) →
      **discount** → **premium** → **B2B** → **new**. Previously premium outranked the
      discount and an out-of-stock item still advertised "-17%" beside "Sold out".
- [x] **0.2/0.3** Checkout trimmed to BD-essential fields + district-driven delivery.
      **Exactly four required fields**: full name, phone, address, district. Email is
      optional and labelled so — the phone number is the identity primitive in this
      market. **Postcode removed entirely** (Bangladeshi addresses are not routed by
      one); `city` free-text replaced by a 64-district select grouped into 8 divisions,
      served by `modules/delivery`. Choosing a district **resolves the zone
      automatically** and dims the tiers that cannot apply, so the buyer never
      self-selects a price band. Express unlocks only for Dhaka. The three radios stay
      real markup, so the step still works with JS off.
      Fixed a **pre-existing component bug** found while rendering it: `.option-card__title`
      and `__sub` were unstyled inline spans, rendering as
      "Dhaka & ChattogramWithin 72 hours" on every delivery *and* payment card.
- [x] **1.1** Gift-with-purchase threshold with live progress in cart + drawer —
      spend ৳3,000, get a free pack of Ceylon Black Tea (a real in-stock SKU,
      gr-1005, not an invented one). Full slice: `gift_rewards` table + model +
      seeder reading the module's own `data/rewards.json`, `CartService` returns
      progress inside the cart payload, and `modules/cart/gift-progress.js`
      renders it in **both** the cart page and the drawer so they cannot drift.
      Progress shows even when unmet — "add ৳1,550 more" is the part that moves
      basket size. Bar motion is JS-driven (rAF, easeOutCubic, honours
      `prefers-reduced-motion`) because it animates between two runtime values.
      First use of the Tailwind-utilities rule; also fixed a **pre-existing**
      +23px overflow on the cart at 375px (`grid-template-columns: 96px 1fr`
      cannot shrink below its content — now `minmax(0, 1fr)`).
- [ ] **1.2** Frequently-bought-together with live savings math
- [ ] **1.3** Offer *rules* rendered on the PDP, not just a badge *(Shajgoj)*
- [ ] **2.1** Per-product search synonyms + **2.3** rotating merchandised placeholder
- [ ] **2.2** Concern/use-case query suggestions
- [ ] **2.4** Category-schema-driven facets via one generic URL param *(Daraz `ppath`)*
      — the unlock for filtering B2B `specs`
- [ ] **3.2** Real sourcing/authenticity page (the hero "Our Sourcing" CTA needs a home)
- [ ] **3.3** Merchant-authored FAQ + Q&A per product *(works with zero customers)*
- [x] **5.1** **Bengali webfont** — Noto Sans Bengali (OFL), **self-hosted** at
      `assets/fonts/noto-sans-bengali-variable.woff2` (105 KB), declared in the new
      `_fonts.css` partial with `unicode-range` copied verbatim from Google's bengali
      subset, so it downloads **only when Bengali codepoints are on the page**.
      **One file, `font-weight: 100 900`** — Google serves byte-identical woff2 for
      `wght@400`, `wght@600` and `wght@100..900`, proving it is the variable font;
      declaring discrete weights would have shipped the same 105 KB twice.
      Added to `--font-body` so Bangla renders anywhere, plus a `[lang="bn"]` rule
      (looser leading, no uppercasing — Bangla has no case).
      Verified with `tools/font-test.html`: face loaded, `fonts.check()` true, and
      the measured width differs from fallback (408px vs 468px) — the only honest
      proof the face is actually painting.
- [ ] **5.3** Pre-production: drop the Tailwind Play CDN, ship `srcset`+AVIF with
      real photography, enable Brotli + long `max-age`, add CSP at the host

**Deliberately rejected** (recorded so they don't get re-proposed): Daraz's
gamification (coins/games/mystery boxes — signals "cheap" on a premium brand),
perpetual countdown urgency, keyword-stuffed titles, 384-link SEO footers, 10px
metadata, cashback clawed back from refunds, and app-install interstitials.

---

## 8. Known Issues / Follow-ups

- ~~Light-bg transparent PNG logo~~ **DONE** — `assets/logo/gulfrabit-logo.png`
  (transparent) is now used site-wide; `gulfrabit-mark.png` is the square mark.
- ~~Favicon square crop~~ **DONE** — `favicon.ico` + `favicon-32.png` +
  `apple-touch-icon.png` cropped from the rabbit mark.
- **Product/hero imagery** still uses SVG placeholders — swap for real photography
  (the one remaining branding follow-up; needs supplied assets).
- **Deployment paths (RESOLVED 2026-07-21):** paths are now **relative** and work
  at a domain root OR a project subpath (`user.github.io/gulfrabit/`). The
  assembler rewrites `/shared|/assets|/modules|url(/…)` per page depth; JS derives
  the site root from `import.meta.url` (`shared/js/core/paths.js` → `siteURL()`),
  never `location.origin`. `.nojekyll` prevents GitHub Pages from dropping the
  underscore-prefixed CSS partials. Verified under a simulated subpath.
- **Tailwind Play CDN** prints a dev-only console notice; fine for now — a real
  build step (PurgeCSS) is the production follow-up.
- **Backend integration point:** each `modules/*/backend/api.js` currently reads mock JSON
  / localStorage. Replace with Laravel REST calls (`endpoints.md` per module).
- **Payment gateway** at checkout is UI-only — `// TODO: connect to payment gateway`.
- **Auth/session** mocked via localStorage — replace with JWT.
- **Product imagery** uses placeholders — swap for real photography with vignette treatment.
- **Barcodes are mock** — `data/products.json` carries synthetic EAN-13 codes that pass
  check-digit validation but are **not GS1-registered**. Replace with real supplier
  barcodes before launch (`_meta.barcodeNote` records this in the data file too).
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
- **2026-07-21 (polish session)** — Frontend perfection pass:
  · SEO: OG/Twitter meta + Organization/WebSite JSON-LD on every page; Product
    JSON-LD on the PDP; `robots.txt`, `site.webmanifest`, generated `sitemap.xml`
    (50 URLs, `tools/sitemap.py`); root-level `404.html` for host 404 handling.
  · Accessibility/resilience: `<noscript>` fallbacks on JS-driven listings.
  · Fixed 2 real bugs found by an independent runtime audit — PDP wishlist button
    bound to empty product data, and the Terms checkbox `required` rule never
    enforcing (checkbox `.value` vs `.checked`).
  · Visual: clean icon-led home category tiles (removed double-labelled bg images)
    with a brand-glow hover; darkened hero overlays; image `decoding=async`;
    account stat-card hover; star alignment; pretty paragraph wrapping.
  · Verified: all 20 pages 200, all 23 asset refs + 26 script/style refs resolve,
    CSS braces balanced, JSON valid.
- **2026-07-21 (deploy-fix + feature session)** — after seeing the live site render
  unstyled at `imran-me.github.io/gulfrabit/`:
  · **Critical:** root-absolute paths 404 on a project subpath → converted the
    whole build to **relative paths** (assembler rewrites per depth) + `siteURL()`
    from `import.meta.url`; added `.nojekyll` (Jekyll was dropping `_*` partials).
    Verified all pages/assets 200 under a simulated subpath.
  · Square favicon set cropped from the rabbit mark; manifest made relative.
  · **Best Sellers authored as real HTML** product cards in index.html (content-
    first); home.js only fills the dynamic rails now.
  · **focus-trap** util → cart drawer, mobile nav, quick-view (keyboard a11y).
  · **Recently-viewed** rail on the PDP (localStorage history).
  · Catalog expanded to **44 products** (every category 4–6) so grids read full.
- **2026-07-21 (branding + features session)** — verified the live deploy renders
  styled. Then: **transparent PNG logo** site-wide (removed the black-box JPEG);
  **order-tracking page** (`account/track.html`) with a status timeline, wired
  from footer/orders/confirmation; **PDP reviews** with an interactive star-rating
  write-review form (localStorage). 22 pages total.
- **2026-07-22 (imagery + features + polish loop)**:
  · **Imagery** — `tools/gen-product-images.py`: a distinct premium image per
    product (category-aware motif) with **3 gallery views** each; clean textless
    hero backgrounds. Grids no longer repeat one tile; PDP has a real thumb rail.
  · **Product compare** — card toggle + global floating tray + `compare.html`
    side-by-side table (best price/rating highlights). state.js `COMPARE`.
  · **Deals module** — `deals.html` (biggest-discounts + sortable grid);
    `data-service.getDeals()`; header/footer links.
  · **Richer filters** — facet counts, On-sale facet, collapsible groups.
  · **Home** — Featured Brands logo-wall.
  · **Checkout** — card fields validated only when Card is selected.
  · 24 pages verified 200 under a simulated subpath. Tools: assemble.py,
    sitemap.py, gen-product-images.py.
- **2026-07-22 (visual QA via headless Chrome screenshots)** — rendered pages with
  headless Chrome, reviewed, fixed, re-rendered. Found + fixed:
  · **CRITICAL:** Tailwind Play CDN preflight (injected after style.css) reset
    h1–h6 to font-size:inherit → every heading rendered at body size. Disabled
    preflight in tailwind.config.js. (This was invisible without rendering.)
  · PDP star rating stacked vertically (svg{display:block}) → inline-flex wrapper.
  · Product images had baked-in title text overlapping the PDP gallery → clean
    textless art.
  · Header logo was a squashed 40px square → proper mark + wordmark lockup;
    mobile header decluttered (account/wishlist in the drawer).
  · Announcement bar → centered block (safer wrapping).
  Verified home/PLP/PDP/deals/B2B/login look premium at desktop and the mobile
  breakpoint. Note: this headless setup enforces a ~500px min viewport, so true
  375px can't be rendered here — but scrollWidth<innerWidth confirms no overflow.
- **2026-07-25 (white-canvas conversion)** — the whole site re-themed dark → light.
  · **Tokens:** added a semantic surface-role layer to `_variables.css` (see Decision
    Log). Shadows re-tuned — the dark theme's `rgba(0,0,0,.20–.34)` reads far too
    heavy on white, so elevation is now ~⅓ opacity and depth comes from the hairline
    border first, shadow second.
  · **Sweep:** rewrote colour roles across **19 CSS files, 48 HTML files and 8 JS
    files**. The HTML contained zero hard-coded Tailwind dark utilities (the design
    system was disciplined), so the flip was almost entirely token-level; the JS
    files mattered because several inject inline `style="color:var(--gr-…)"` at
    runtime, which CSS-only edits would have missed.
  · **Imagery regenerated:** all product/category/hero art baked in `#141414`/`#151515`
    backgrounds and would have read as 155 near-black tiles on a white page.
    `gen-product-images.py` now emits a white studio canvas (ink facets, soft ground
    shadow, light vignette); the 10 category tiles and 3 hero SVGs were converted too.
  · **Two real bugs found only by rendering:** (1) `<meta name="color-scheme"
    content="dark">` on all 24 pages made the browser paint every checkbox/radio as a
    black square on the white PLP filter rail; (2) star ratings and "In stock" chips
    were injected from JS as raw `--gr-lime`, invisible-ish at 1.9:1 on white.
  · Verified: 24/24 pages 200, 45/45 asset refs resolve, CSS braces balanced, JSON
    valid, screenshots reviewed at 1440px for home/PLP/PDP.
  · **Known gap:** `.canvas-dark` is now a light canvas — the class name is a
    leftover from the dark era and should be renamed in a follow-up.

- **2026-07-26 (competitor-derived features, then a full-stack re-architecture)**
  Two halves. First, Phase 6 features built one at a time, each verified at
  375/414/768 with measured overflow, console checks and a full page sweep before
  the next was started:
  · **0.1** WhatsApp + Messenger order CTAs on the PDP, prefilled with title,
    price, SKU and absolute URL; real links so they survive JS being off.
  · **0.4** Per-tender refund matrix, linked from the PDP and the checkout payment
    step; stacks into labelled blocks under 560px so the timeline column — the
    actual answer — is never the one hidden by a sideways scroll.
  · **3.1** Provenance leads the spec tab for EVERY product. Fixed a real bug:
    industrial SKUs took a specs-only branch that dropped origin entirely.
  · **1.4** One delivery promise sitewide. The banner promised free delivery over
    ৳3,000 while checkout charged ৳60 regardless — a promise the code never kept.
  · **4.2** Absolute savings beside the percentage; also fixed `.price` wrapping
    between the ৳ symbol and the number in 2-up cards at 375px.
  · **4.1** Badge slots priority-ordered and capped. Sold-out now returns alone —
    an out-of-stock product was advertising "-17%" beside "Sold out".

  Then the architecture was **locked** (§2) and applied:
  · `modules/delivery/` built as the reference vertical slice — the first module
    with a real Laravel layer. `shared/js/core/delivery.js` deleted.
  · **0.2/0.3** Checkout cut to four required fields with district-driven pricing.
  · `modules/catalog/` given its Laravel layer, and its data moved in with it.
  · `modules/cart/` given its Laravel layer — server cart, guest→user merge,
    and promo codes as *data* in a `promotions` table rather than a PHP constant.
  · **`shared/js/core/data-service.js` deleted.** It held four modules' domains in
    one global file that 19 files imported directly, bypassing every module seam.
    Each module now owns its data and its door; the only shared piece left is
    `core/json-cache.js`, a domain-free fetch-and-memoise helper.
  · Laravel host wiring added (`composer.json` PSR-4 per module,
    `bootstrap/providers.php`, `BACKEND.md`).

  **Three real bugs were found by running things rather than reading them:**
  `<meta name="color-scheme" content="dark">` painting every checkbox black;
  `tools/sitemap.py` breaking on the data move because it builds its path from
  parts and never matched the grep; and `cart-promo` in localStorage holding an
  object that would have thrown `TypeError` on `code.trim()` for any returning
  visitor after the promo refactor.

  **Tooling:** `tools/qa-viewport.html` — headless Chrome clamps its viewport to
  ~526px, so a `--window-size=375` screenshot is a 526px render cropped to 375 and
  looks broken when nothing is wrong. The harness frames pages in exact-width
  iframes and *measures* `scrollWidth` vs `clientWidth`. It also seeds carts,
  pre-selects districts and auto-fills required fields, without which every
  cart/checkout check was silently auditing an empty-cart guard.

  ⚠ **No PHP has been executed** — `php`/`composer` are absent on this machine.
  The Laravel code is authored and structurally checked only.
