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

> **→ `CONVENTIONS.md`** distils this into the actual working rules: money as integer
> poisha, the client never sets a price, snapshot vs read-through, rules as data,
> 404-not-403, thin controllers, contract-before-code, comments that explain *why*,
> and verify-by-running. Hand that file to any new developer along with this one.

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
| `auth` | authored — provider, routes, controller, 4 requests, 2 services, model, migration (**OTP-first**) |
| `account` | authored — provider, routes, 2 controllers, request, address service, 2 models, 2 migrations |
| `b2b` | authored — provider, routes, controller, request, quote service, 2 models, 2 migrations |
| `deals`, `home` | **none needed** — own no data; compose `catalog` through its door |
| `content` | **none needed** — static pages; a backend only if a page CMS or contact form is added |

**Every module now has the backend it should have.** `deals`, `home` and `content`
have none *deliberately*: giving them controllers would put two places in charge of
what "featured" means, which is how a catalog starts contradicting itself.

**Module dependency graph** (verified one-way, no cycles):
`catalog` and `delivery` depend on nothing · `cart` → `catalog` · `auth` → `cart` · `account` → `catalog`, `delivery` · `checkout` → `cart`, `catalog`, `delivery`

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
- [x] **1.2** Frequently-bought-together with live savings math — shipped as
      `modules/bundle/`, a full module (frontend + CSS + data + Laravel layer)
      that mounts its own block onto the PDP. 19 merchant-curated pairings cover
      all 44 products, each stating WHY its members belong together. The heading
      is `Goes well together` until the server counts >= 5 distinct **paid**
      orders containing the pair, and only then becomes `Frequently bought
      together` — the claim is about other customers, so it is not printed
      before it is true. No invented bundle discount: the saving shown is the
      real `originalPrice - price` the checkout already charges.
- [x] **1.3** Offer *rules* rendered on the PDP, not just a badge *(Shajgoj)* —
      `modules/cart/pdp-offers.js` mounts an "Offers on this item" block listing
      every rule the checkout actually enforces, each with its condition, what
      it is worth against THIS item, and how far away it is. Named caps
      (GULF10 gives ৳ 1,000 on an ৳ 18,900 item, not ৳ 1,890). Volume tiers are
      shown for B2B parts but labelled as quoted by the desk, because the cart
      charges the listed unit price. Lives in `cart` because the rules are
      cart's — delete the module and the block goes with it.
- [x] **2.1** Per-product search synonyms — `searchTerms` on all 44 products
      (501 terms, 11.4 avg), generated by `tools/gen-search-terms.py`. The part that
      matters here: **romanised Bangla**. A Dhaka shopper types *khejur*, not "dates";
      *modhu*, not "honey"; *chaku*, not "knife". Matching only English titles
      silently loses that traffic. Synonyms match **whole words only** — substring
      matching would make "cha" (tea) hit anything containing those letters.
      Mirrored in `ProductQueryService` so JS and SQL agree.
- [x] **2.2** Suggested queries on empty focus — concern-shaped, not prefix
      completions. Every one is asserted to return ≥1 product by
      `tools/check-search-suggestions.py`; a suggestion leading to an empty results
      page teaches the customer the search is broken.
- [x] **2.3** Merchandised rotating placeholder — built from `getDeals()` rather
      than a CMS field, so it maintains itself ("Medjool Dates · 19% off"). Stops
      the moment the customer focuses or types, and does not run at all under
      `prefers-reduced-motion`.
- [x] **2.4** Category-schema-driven facets via one generic URL param *(Daraz `ppath`)*.
      Facets are derived from each product's own `specs` — no hand-built filter list per
      category — and encoded as `?spec=Compliance:RoHS,Compliance:REACH`, one parameter
      whose shape never changes when a category gains an attribute. OR within a facet,
      AND across facets. Two rules make it actually work:
      **(1)** list-valued specs are split, so "UL, TÜV, RoHS" is three facts rather than
      one unique string — without this every product is its own value and the facet
      filters nothing; **(2)** a facet is shown only when some value covers ≥2 products,
      so at 44 SKUs only *Compliance* qualifies and the food category correctly shows
      none. Mirrored in `ProductQueryService` via JSON path + LIKE.
- [x] **3.2** Real sourcing/authenticity page — `/modules/content/sourcing.html`.
      Shows the METHOD, not the claim: four steps, the one thing a customer can
      check themselves (barcode on the pack vs. barcode in Specifications), the
      origins counted live from the catalogue, and a "what we do not claim"
      section. The hero CTA and footer now point at it. My earlier assessment
      that `about.html` already covered this was wrong — about.html asserts
      authenticity, it never shows how it is established.
- [x] **3.3** Merchant-authored FAQ per product *(works with zero customers)* —
      `tools/gen-product-faq.py` writes `faq: [{q,a}]` onto all 44 products (147
      questions, 3.3 avg). Every answer is derived from data the product actually
      carries — barcode, origin, dietary flags, MOQ, price tiers — so nothing is
      invented. No "Is it halal?" answer, because certification is not in the
      dataset and writing one would fabricate a claim about real food. Rendered on
      the PDP as a FAQ tab of native `<details>` (keyboard-accessible and reachable
      by find-in-page for free), plus FAQPage JSON-LD.
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

### Phase 7 — Admin panel (ADDITIVE MILESTONE, started 2026-07-27)

The storefront to-do above is NOT superseded by this. 5.3 and everything in §8
stays open and gets finished; the admin panel is a second application that runs
alongside, not instead.

**Five new modules.** Each passes the deletion test on its own.

| Module | Owns | Deleting it removes |
|---|---|---|
| `modules/admin` | Staff auth + roles, layout, nav registry, dashboard, and the admin screens over existing domains (orders, customers, products) | The entire admin panel. The storefront is untouched. |
| `modules/courier` | Carrier providers, consignment assignment, tracking events | Courier assignment + tracking sync. Orders still work, just unassigned. |
| `modules/inventory` | Warehouses, stock levels, movements, adjustments | Stock tracking. Products keep their `inStock` flag. |
| `modules/accounting` | Chart of accounts, journal, ledger, P&L, expenses | The books. Nothing else depends on them. |
| `modules/cms` | Editable content blocks + the inline editor | Live editing. Pages fall back to their authored HTML. |

Admin screens for orders/customers/products live in `modules/admin` deliberately:
they are admin functionality, so deleting admin must remove them. Admin depends
on checkout/auth/catalog for data — one-way, no cycle.

**Nav is contributed, not hardcoded.** `admin-shell.js` exports
`registerScreen()`; each module's admin script calls it, and `assemble.py`
includes that script. Delete the module and its assemble entry and its nav entry
disappears — the same pattern as `modules/bundle` and `pdp-offers.js` on the PDP.
Admin never imports from courier/inventory/accounting/cms.

**Build order** (dependency-first, one at a time, verified before moving on):

- [x] **7.1** Admin shell — `modules/admin/`. Staff auth on a separate
      `admin_users` table with five roles, the `admin` guard + `RequireAdmin`
      middleware, a contributed nav registry, login and dashboard screens.
- [x] **7.2** Orders & fulfilment — filtered list (state in the URL), order
      detail, a whitelist state machine, an append-only status-event log, and
      refunds with their own audit trail. Domain rules live in
      `modules/checkout` so they hold for webhooks and customers too.
- [x] **7.3** Couriers — `modules/courier/`. Driver contract, a manual driver
      that genuinely works, 7 real BD carriers seeded, consignments with their
      own event log, and courier statuses feeding order status THROUGH the
      fulfilment whitelist.
- [x] **7.4** Customers — search-first index, detail with order history,
      addresses and internal notes, plus owner-only erasure that ANONYMISES
      rather than deletes (orders are accounting records; the transaction is
      not the person).
- [x] **7.5** Products & inventory — `modules/inventory/` (warehouses, stock
      ledger, reservations, stocktakes) plus `products.cost_poisha`, the admin
      product list/edit screens and an append-only price-change log., low-stock
- [x] **7.6** Accounting — `modules/accounting/`: chart of accounts, immutable
      double-entry journal, auto-posting from paid orders and refunds, expenses,
      trial balance and P&L. Gross profit is reported as NULL with a stated
      reason whenever any sale lacked a cost of goods.
- [x] **7.7** CMS — `modules/cms/`: per-node overrides, click-to-edit on the
      live page, text and image only. 61 nodes annotated across 5 content pages
      by `tools/annotate-cms.py`.

**Decisions taken (2026-07-27, with the user):**

1. **Double-entry, not a cash book.** Chart of accounts, journal, ledger, trial
   balance, P&L and balance sheet. Orders, refunds, delivery charges, COGS and
   expenses post journal entries automatically. It reconciles and an accountant
   can audit it.
2. **Staff accounts are separate from customers.** A distinct `admin_users`
   table with roles (owner, manager, warehouse, accounts, editor). A leaked
   customer password must never reach the admin panel, and the warehouse role
   must not see the P&L.
3. **Couriers: framework first, no credentials yet.** A provider-agnostic layer
   with a manual provider that works today (assign, record tracking number,
   update status). Pathao/Steadfast/RedX/eCourier adapters drop in later without
   changing orders or the UI.
4. **CMS edits content, never layout.** Text and image `src`/`alt` only. The
   editor refuses to touch classes, structure or attributes that affect layout —
   enforced in code, not just documented.

**Security posture for a statically-served admin.** The admin HTML is served as
static files like the rest of the site, so it is readable by anyone who guesses
the URL. That is acceptable ONLY because it contains no data: every figure on
every admin screen arrives from an authenticated API call, and the client-side
guard is a redirect for convenience, never a control. The real authority is the
`admin` middleware on the server. Admin pages are excluded from `sitemap.xml`
and disallowed in `robots.txt`, and the host should add HTTP auth in front of
`/modules/admin/` as defence in depth.

**Deliberately rejected** (recorded so they don't get re-proposed): Daraz's
gamification (coins/games/mystery boxes — signals "cheap" on a premium brand),
perpetual countdown urgency, keyword-stuffed titles, 384-link SEO footers, 10px
metadata, cashback clawed back from refunds, and app-install interstitials.

---

## 7b. LIVE DEPLOYMENT (as of 2026-07-30) — READ THIS FIRST

**The site is live at https://gulfrabit.com** — Laravel 12, PHP 8.3, MySQL, on
Hostinger. Not GitHub Pages. PHP genuinely executes; `/api/catalog/products`
returns 24 products from the database.

### How deployment works now

```
edit in VS Code  →  git push  →  live within ~1 minute
```

A cron job on the server runs `deploy.sh` every minute. It fetches, resets to
`origin/main`, runs Composer only when the lock changed, applies **migrations**,
and rebuilds caches. It exits in milliseconds when nothing moved.

**Hostinger's hPanel → GIT "Redeploy" button is NOT used** — it has no webhook
and cannot run migrations. The cron replaces it entirely.

### Server facts

| | |
|---|---|
| SSH | **BLOCKED from the owner's network** on 22 and 65002, on wifi and mobile. All server work goes through hPanel cron jobs. |
| Path | `/home/u239665931/domains/gulfrabit.com/public_html` |
| Cron command form | `/bin/bash /full/path/script.sh` — Hostinger execs without a shell, so `cd` and `&&` fail |
| PHP | 8.3.31 · Laravel 12.64 |
| `.env` | On the server only. **Hostinger's WAF blocks saving a file named `.env` in File Manager** — upload as `.txt` and rename. |

### Scripts on the server

| Script | When |
|---|---|
| `deploy.sh` | **Permanent cron, every minute.** Do not remove. |
| `doctor.sh` | Run on demand via a temporary cron when something breaks — reports EVERYTHING at once |
| `setup.sh` | First install only |
| `reset-db.sh` | Wipes and rebuilds. **Refuses once real orders exist.** |

### PERMANENT BACKUP

- **Git tag `v1.0-live`** (pushed to GitHub) — `git checkout v1.0-live` restores
  the exact state at go-live.
- **Zip:** `D:\Shah Alam\GulfRabit\_BACKUPS\gulfrabit-v1.0-live-2026-07-30.zip`

Before modifying a module, tag it: `git tag pre-<module>-<date>`.

---

## 7c. PHASE 8 — CATALOGUE MANAGEMENT + LUXURY UI (owner brief, 2026-07-30)

**Owner's words:** "I will login, add product, delete products, add categories,
what to show in highlights, what to showcase, how to change price listing,
coupon set, original vs discount price, add multiple photos."

Full autonomy granted: build continuously, no permission needed, verify each
piece before moving to the next.

### What EXISTS today (do not rebuild)

Admin product **edit** only: title, brand, short description, price, was-price,
cost, in-stock, listed. Price changes logged. Screens: dashboard, orders,
quotes, couriers, customers, products, stock, P&L, journal.

### What is MISSING — the Phase 8 build order

- [x] **8.1 Categories** DONE 2026-07-30 — CRUD, **on/off toggle** (off = category AND its
      products vanish from the site; on = they return), sort order, menu
      visibility. Do this first: the new categories below depend on it.
- [x] **8.1b Sub-categories + images** DONE 2026-07-30 — parent selector, indented
      cards, ONE level deep (enforced in `reparent()` both directions).
      `Product::scopeActive()` now checks the grandparent, so a product in
      `Dates > Ajwa` hides when `Dates` goes off — read at query time, NOT
      cascaded onto child rows, so switching the parent back on does not
      resurrect children that were off deliberately. Deleting a parent is
      refused: the FK is `nullOnDelete` and would silently promote its children
      into the header nav.
- [x] **8.2 Products** DONE 2026-07-30 — create (4 fields + a photo, then straight
      to the edit screen), delete = **soft delete** + `restore()`, move between
      categories, ordered photo gallery. `nextSku()` reads the highest number
      **including trashed rows** — a reused SKU would mean two products sharing
      an identifier across order history. New products are created UNLISTED.
- [x] **8.3 Images** DONE 2026-07-30 — `modules/media/`. See its README; the
      security notes in `ImageStore.php` are the important part. Files go to
      `/uploads/YYYY/MM/<sha256>.webp`, untracked by git except `.htaccess`
      (`git reset --hard` leaves untracked files alone, so they survive
      deploys). **Needs GD** — fails loudly rather than falling back to a plain
      move, which is the hole the whole class exists to close.
- [ ] **8.4 Highlights / showcase** — pick featured products by clicking, decide
      what appears on the home page
- [ ] **8.5 Coupons** — create codes, min spend, cap, expiry, on/off.
      Currently GULF10/HOP500 are HARDCODED in `PromotionSeeder.php`.
- [ ] **8.6 Menus / submenus** — manage the header nav from the panel
- [ ] **8.7 Luxury UI/UX pass** — see below

### NEW CATEGORIES the owner wants (add these)

1. Imported Food & Grocery · 2. Dates · 3. Honey · 4. Beverage ·
5. Dry Fruits · 6. Spices · 7. Nuts & Makhana · 8. Baby Food · 9. Herbs ·
10. Oil & Ghee

**Keep the existing categories** (electronics, kitchen, fashion, beauty, office,
industrial) — just give everything an on/off switch so unused ones can be
hidden rather than deleted.

### UI/UX direction

> "Minimal, clean, yet luxurious, high quality and classy visuals and effects.
> BD's only platform where every item is 100% imported, premium, high price."

- **MOBILE FIRST — the top priority.** Most customers are on phones.
- Alignment, button consistency, hover/press effects, considered animation
- Study comparable premium retailers before designing
- Effects go in JS per the locked architecture; Tailwind + custom CSS for style

### Working method the owner asked for, explicitly

1. Back up the module before touching it
2. Build
3. **Check → review → test → compare against the previous look**
4. Refine, re-apply, re-check
5. Only at 100% satisfaction, move to the next

### Two rules added while building 8.2 / 8.3

**Assets are content-hashed, and the cache policy keys on that.**
`tools/assemble.py`'s `asset()` appends `?v=<8 hex of the file's bytes>` to
every CSS and JS link. `.htaccess` then caches for a year *only* when that
query is present, and sends `no-cache` for everything else. This exists because
a shipped admin screen was invisible in the browser while being present on the
server — it read as a failed deploy. **Anything reached by a runtime
`import()` cannot carry a hash** (the specifier is written in source), which is
exactly why the unhashed case must revalidate rather than being cached.

**One module may only hard-depend on another if it is the host shell.**
`modules/admin` is the platform every admin screen imports. Everything else
loads an optional module with a *dynamic* import and a `.catch(() => null)`,
then degrades — see `categories-page.js` loading media. A static `import` would
make deleting `modules/media/` blank out the Categories screen, which is the
one thing the module structure exists to prevent. `tools/module-deps.py` now
reads JS as well as PHP and **fails the build on a static cycle**; dynamic
edges are listed as `(optional: …)` and never counted.

### Traps to remember

- **Do NOT add `db:seed` to `deploy.sh`.** Seeders use `updateOrCreate`, so a
  deploy would silently revert prices edited in the admin panel.
- Deleting a product must UNLIST, never hard-delete — `order_items` references it.
- Category off must hide its products too, without deleting anything.
- Every admin write needs the CSRF header (`csrfHeader()` in
  `modules/admin/backend/api.js`) — admin pages are static, so Laravel cannot
  inject a token.

---

## 8b. BLOCKED — cannot be done here, and why (2026-07-28)

Kept separate from the follow-up list because these are not "not yet done" —
they are "cannot be done from this machine or without something only the owner
can supply". Verified, not assumed: `php`, `composer`, `node` and `mysql` are
all absent from this environment.

### B1. No PHP has ever executed
115 PHP files pass structural checks and **none has ever run**. No
`composer install`, no migration, no request served. So none of this is proven
to work, only to be well-formed:
staff sign-in and lockout · role enforcement · the order state machine · the
row locks on transitions and refunds · every dashboard query · all seeders.
**Needs:** PHP 8.4 + Composer + MySQL — i.e. Hostinger. This is the single
biggest gap in the project.

### B2. Third-party accounts and credentials (owner must supply)
| Blocked | Consequence today |
|---|---|
| Payment gateway (bKash / Nagad / card) | Checkout is UI-only; no order can actually be paid |
| SMS gateway | Customer OTP login is mocked; staff cannot be alerted |
| Email sending (SMTP/API) | No order confirmation, no staff invite, no password reset |
| Courier APIs (Pathao, Steadfast, RedX, eCourier) | 7.3 ships the framework + a manual provider only |
| Real GS1 barcodes | The 44 in `products.json` pass check-digit validation but are **not registered**, and the Sourcing page tells customers to check them |

### B3. Assets the owner must provide
Real product and hero photography. Everything is an SVG placeholder, which also
blocks `srcset`/AVIF (5.3) — there is nothing to generate responsive sizes from.

### B4. No Node/npm on this machine
Blocks replacing the Tailwind Play CDN with a real build (PurgeCSS), JS
bundling/minification, and any automated JS test runner. Everything is verified
by driving headless Chrome instead.

### B5. Business data only the owner has — **blocks 7.6 accounting**
- **Cost prices.** `products.json` has `price` and `originalPrice` but **no
  cost field** (verified). Without cost there is revenue but no COGS, so gross
  margin and a real P&L are impossible. This is the hard blocker for 7.6 and
  needs either a cost per SKU or supplier invoices to derive it from.
- Opening balances and a real chart of accounts; bank / mobile-money account
  details; fiscal year start.
- VAT/BIN registration and the rates that apply per category.
- Real warehouse locations and supplier list (7.5).
- Real staff names, emails and role assignments.

### B6. Host / environment
HTTPS + domain · CSP (including a hash for the inline `no-js` script) · HTTP
auth in front of `/modules/admin/` · backups · cron for scheduled jobs · a queue
worker for emails and webhooks.

### B7. Deliberately not done without authorisation
Live courier API calls, and sending real email or SMS to real customers.

**What is NOT blocked:** every remaining Phase 7 module can be built and
verified against the mock seam exactly as 7.1 and 7.2 were — except the
accounting P&L, which needs B5's cost prices to be more than a revenue report.

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
- **2026-07-27** — Per-product FAQ (to-do 3.3) and the end of the delivery-rate
  duplication.
  · **3.3 FAQ** — `tools/gen-product-faq.py` generates 147 questions across 44
    products from real product data only; `renderFaq()` in `product-page.js` paints a
    `<details>` accordion into the new FAQ tab and injects FAQPage JSON-LD.
    Verified: 5 questions on gr-1001, 4 JSON-LD blocks, no overflow at
    375/414/768/1280, no console errors.
  · **Delivery rates** — `tools/sync-delivery-copy.py` grew named blocks, so one file
    can hold several. Coverage went from 5 blocks to **9 across 7 files**: added the
    PDP trust strip, the PDP Shipping-tab prose, the checkout summary's pre-JS
    default, and the site FAQ's delivery answer.
  · **The generator now has a detector.** `find_strays()` greps the tree for a rate
    written outside a generated block and fails `--check`. It found 2 of those 4
    copies immediately — a generator alone only fixes the copies you remember, and
    the ones written in prose are exactly the ones you don't.
  · The PDP prose had silently omitted express (৳ 150) since express was added at
    checkout; generating it from the zone list fixed that as a side effect.
  · Round-trip verified: set metro to ৳ 99, ran the tool, confirmed **zero** stale
    "৳ 70" anywhere in the shipped output and 30 files updated, then reverted.
  · 26 pages 200 · 88 PHP files clean · dependency graph still one-way · htaccess
    both directions still asserted.
- **2026-07-27** — `modules/bundle` (to-do 1.2), and the MOQ bugs it exposed.
  · **New module** — `modules/bundle/` with frontend, CSS, `data/bundles.json`
    (19 pairings covering all 44 products), the `backend/api.js` seam, and the
    Laravel layer (provider, route, controller, service, model, migration,
    seeder). Named from exactly two places outside itself: `composer.json` and
    `bootstrap/providers.php`. Deps: catalog + cart, one-way, still cycle-free.
  · **It self-mounts.** `bundle.js` inserts its section after `[data-pdp]`
    rather than filling a placeholder in catalog's fragment, so deleting the
    folder leaves no orphan markup. `tools/assemble.py` now accepts a LIST of
    module scripts/styles per page — that is the whole coupling.
  · **Honest labelling.** `BundleService` returns `source: curated|behavioural`
    and the client only picks wording from it. Only *paid* orders count toward
    the threshold; letting abandoned baskets vote would let anyone manufacture
    a pairing by starting checkouts. The co-purchase aggregate stays server-side
    because the table behind it is every customer's basket.
  · **Three real MOQ bugs, found by building this:**
    1. The PDP stepper started at 1 and stepped by 1 for a part with a
       1,000-unit minimum — so a customer could order one switch at the
       1,000-unit unit price. `data-step` added to the shared stepper; the PDP
       now feeds it `p.moq` and clears the `ready` flag so the re-run takes.
    2. Four `addToCart` call sites hand-built a product subset and dropped
       `moq`. They now pass the product itself.
    3. `state.js` clamped EVERY line to 1..99, so adding 1,000 switches
       silently stored 99. Bounds are now per line (`qtyBounds`), and the cart
       page steps by the line's own minimum and labels it.
    Verified end to end in a browser: 50/100/100/1,000/200 units added, line
    totals 11,000/18,500/4,200/3,200/1,800, subtotal 38,700; dropping the
    1,000-line to 1 clamps back to 1,000; retail lines still cap at 99.
  · **Layout decided by measurement, not guesswork.** The first flex version
    with `+` separators wrapped 3 items as 2-plus-1-orphan at 768 and 992, and 5
    items as 4-plus-1 at 1440. Replaced with
    `grid-template-columns: repeat(auto-fit, minmax(210px, 1fr))` and the
    separators dropped: cards are now identical widths at 375/414/768/992/1200/
    1280/1440 for both a 3-item and a 5-item bundle, and two media queries went
    away.
  · **Backend parity for 3.3** — `products.faq` migration, cast, fillable,
    seeder mapping and `toStorefrontArray()`; the FAQ had existed only in JSON.
  · 26 pages 200 · 96 PHP files clean · no console errors on 12 pages · no
    overflow at any width · delivery `--check` still green.
- **2026-07-27** — Offer rules on the PDP (to-do 1.3), and two more B2B pricing bugs.
  · **`modules/cart/pdp-offers.js` + `.css`** — self-mounting block above the
    trust strip. Every row states the rule, its threshold, its worth against
    this item, and whether the item clears it. Caps are named rather than
    discovered at checkout.
  · **`promotions.is_public`, defaulting to FALSE.** Publishing offers needed
    something to decide which codes may be printed. Without the flag, "every
    redeemable promotion" is the only answer available, and the first win-back
    or influencer code would appear on all 44 product pages the day it was
    created. Defaulting to false means a code leaks only by deliberate act, not
    by forgetting one. `Promotion::scopePublic()`, `PromotionService::
    publicOffers()`, `CartService::activeGiftOffer()`, `GET /api/cart/offers`.
  · **Bug — offers were priced against the unit, not the minimum order.** The
    tactile switch is ৳ 3.20 a unit with a 1,000-unit MOQ, and the block said
    "add ৳ 997 more to qualify" for an offer its minimum order clears three
    times over. Now evaluated against `price × moq`, and the status line says
    which one qualified it.
  · **Bug — sub-taka prices were rounded to whole taka.** `formatBDT` printed
    ৳ 3.20, ৳ 2.60 and ৳ 2.10 all as "৳ 3" or "৳ 2", so the homepage's B2B tier
    table showed three tiers, two of them apparently identical, and the PDP
    quoted a unit price ৳ 0.20 below what the cart charges — ৳ 200 over a
    minimum order. Amounts under ৳ 100 that are not whole now keep their paisa;
    every retail price renders exactly as before (verified across 5 pages: the
    only decimals anywhere are the three genuinely fractional component prices).
  · 26 pages 200 · 97 PHP files clean · no console errors · no overflow at
    375/414/768/1280.
- **2026-07-27** — Sourcing page (to-do 3.2), and a resilience bug it exposed.
  · **`/modules/content/sourcing.html`** — the page the hero's "Our Sourcing"
    button always promised. It answers with method rather than adjectives: the
    four steps, the origins table, and the barcode check a customer can run in
    ten seconds when the parcel arrives.
  · **A "what we do not claim" section**, which is the part that makes the rest
    credible: we do not lab-test, we do not print certifications we cannot
    evidence, volume prices are quoted not automatic, and origin is the
    producer's declaration. Consistent with the FAQ generator's refusal to
    answer "is it halal?".
  · **It also corrects a myth we would otherwise be trading on.** A barcode's
    leading digits identify the GS1 organisation the brand registered with, NOT
    the country of manufacture — and in this catalogue the prefixes genuinely do
    not line up with the stated origins. So the page uses the barcode for the
    one thing it proves (this pack is the item we listed) and says so.
  · **`tools/gen-sourcing-facts.py`** counts the coverage figures and the origins
    table from products.json into GENERATED markers, so the claims cannot drift
    from the catalogue. It also validates every EAN-13 check digit and rejects
    duplicates — the page tells customers to check the barcode, and a code that
    fails its own checksum would fail in their scanner and discredit the one
    verifiable promise on the site. All 44 currently pass.
  · **`tools/sitemap.py` now derives its page list from `assemble.py`'s PAGES.**
    The Sourcing page was built, registered and linked, and the sitemap still
    did not know it existed — a hand-kept second copy of the page list, exactly
    the delivery-rate trap again. Inclusion is now the default; exclusion is a
    NOINDEX entry with a stated reason, and a stale entry fails the run. Also
    excluded the three query-parameter templates: bare `product.html` is
    literally the "product not found" screen.
  · **BUG (site-wide, pre-existing) — with JavaScript off, most of the site was
    invisible.** `[data-reveal]` was `opacity: 0` in CSS with only
    IntersectionObserver to undo it, so 10 of 11 blocks on Sourcing, the About
    values and 25 blocks on the home page never appeared. Now scoped to
    `html:not(.no-js)`, with an inline `<head>` script dropping the class before
    first paint. Verified by rendering the page with every `<script>` stripped:
    it renders completely. Note for pre-production: that inline script needs a
    CSP hash.
  · 27 pages 200 · 97 PHP files clean · no console errors on 8 pages · no
    overflow at 375/414/768/1280 · all four generators' --check green.
- **2026-07-28** — Phase 7 begins: `modules/admin` (7.1), the panel's shell.
  · **Staff are not customers.** `admin_users` is a separate table from `users`.
    The storefront authenticates by SMS OTP and anyone can open an account; if
    admin were a flag on that table, every customer-auth weakness would become
    an admin compromise. Two tables means there is no column to set.
  · **Five roles, one per account** (`AdminUser::CAPABILITIES` is the whole
    truth). warehouse gets orders + inventory and no money; accounts gets the
    books but cannot edit customers or the catalogue; editor sees only content.
    Every role has `dashboard` so nobody signs in to a panel with nothing in it.
  · **Filtering happens on the server.** `AdminDashboardController` never sends
    a warehouse account the revenue figure — data the client hides is still data
    the client received. It also `Schema::hasTable`-guards every card, so
    deleting a module costs the dashboard one card, not a 500.
  · **The client-side guard is a convenience, and the README says so.** The
    admin HTML is static and public; it is safe only because it holds no data.
    `RequireAdmin` middleware is the authority. Admin pages are `noindex`,
    disallowed in robots.txt and excluded from the sitemap.
  · **The fixture session cannot become an auth bypass.** It engages only when
    the endpoint is ABSENT (network error, 404, or 501 — a static server's
    answer to POST). A 401/403 is a real backend saying no, and the fixture
    stays out of it. 405 is deliberately excluded because Laravel returns it for
    a real route with the wrong method. Plus: local origins only, plus an
    explicit localStorage switch, plus an unmissable banner on every screen.
  · **Nav is contributed, not hardcoded.** `registerScreen()` in
    `admin-shell.js`; admin imports nothing from courier/inventory/accounting/
    cms. `assemble.py` grew an `ADMIN_PAGES` registry and an `assemble_admin()`
    that omits the storefront header/footer — a staff tool with a shop nav in it
    invites someone to click "Deals" mid-task.
  · `tools/sitemap.py` now reads both registries; without that its stale-
    exclusion guard rejected the admin NOINDEX entries and would have put the
    staff panel back in the sitemap.
  · **No default password.** `AdminUserSeeder` requires `ADMIN_EMAIL` and
    generates a strong password when none is set, printing it once.
  · Layout fixed by measurement: the mobile sidebar was taking 550px of a 900px
    screen (grid rows stretch). `grid-template-rows: auto 1fr` plus reordering
    brand/identity onto one row brought it to 169px at 375 and 134px at 768.
  · 29 pages 200 · 107 PHP files clean · no console errors · no overflow at
    375/414/768/900/1280/1440 · dependency graph still one-way.
- **2026-07-28** — 7.2 orders & fulfilment.
  · **The rules live in checkout, the screens in admin.** `OrderFulfilmentService`
    is in `modules/checkout` because a courier webhook and a customer cancelling
    from their account must obey the same transitions. Deleting the admin panel
    must not make it possible to move an order from delivered back to placed.
  · **Transitions are a whitelist**, not a validated dropdown: `placed →
    confirmed|cancelled`, `shipped → delivered|returned`, `cancelled`/`returned`
    terminal. `allowedTransitions()` is the single source for both the API check
    and the buttons drawn, so the panel can never offer a move the server would
    refuse. Warehouse is additionally barred from cancel/return — the role that
    cannot see money should not start money moving.
  · **Two append-only tables.** `order_status_events` records who changed what
    and when (a column that is overwritten keeps no history); `order_refunds`
    records each refund with amount, method, reason and authoriser, because
    partial refunds happen more than once and a running total in a column tells
    you only the sum.
  · **Both writes take a row lock and re-check inside the transaction.** Two
    people clicking "Mark shipped" would otherwise write two events with a stale
    `from_status`; two concurrent refunds would otherwise both pass a
    check-then-write and send out more than came in.
  · **Nav registration split out of page scripts** (`admin-nav.js`, loaded on
    every admin page). It was inside the page scripts, so the sidebar was built
    from whatever happened to be loaded — the Orders screen showed no Dashboard
    link and vice versa. `registerScreen({match:[…]})` also keeps a section
    highlighted on its detail pages, compared as full paths because
    `"order.html".endsWith("orders.html")` is a near-miss that highlights the
    wrong row.
  · 31 pages 200 · 115 PHP files clean · no console errors · no overflow at
    375/768/1280/1440 · storefront unaffected.
- **2026-07-28** — 7.3 couriers (`modules/courier`).
  · **The manual driver is a real driver, not a stub.** No courier has API
    credentials (§8b/B2), so all seven carriers run on `manual`: hand over,
    type the tracking number, record each status. That is how most BD merchants
    already work, and treating it as first-class means the consignment → event →
    cost pipeline is in daily use from day one. A Pathao adapter later touches
    one new class and one row.
  · **`is_active` and `is_configured` are separate columns.** "We are not using
    RedX this month" and "no credentials exist" are different facts, and
    collapsing them hides WHY a courier cannot be booked. The panel states it in
    three places rather than hiding a courier that cannot auto-book.
  · **Order status is never written from the courier module.** A delivery scan
    calls `OrderFulfilmentService::transition()` like anything else — same
    whitelist, same audit row, `actor_type = 'system'`. A late scan on a
    cancelled order is refused by that whitelist, the consignment event is still
    written because it happened, and the request still succeeds: a courier's
    webhook must not fail because our order moved on.
  · **Only 4 of 8 courier statuses imply an order status.** `failed` changes
    nothing — the parcel is still out and they will retry. Mapping all eight
    would make the customer's tracking page flap.
  · One open consignment per order (two riders, one parcel); closed ones stay as
    history, which a `courier_id` column on orders would have overwritten.
  · Courier cost ≠ the customer's delivery fee; both kept, because that
    difference is whether delivery makes money. COD tracked separately and
    starts un-remitted — until the courier hands the cash over it is a
    receivable, not money in the bank.
  · Credentials are `encrypted:array` + `$hidden`; duplicate webhook scans are
    absorbed by a unique `(consignment_id, external_id)`.
  · 32 pages 200 · 131 PHP files clean · no console errors · no overflow at
    375/768/1280/1440 · graph one-way (`courier → checkout`).
- **2026-07-28** — 7.4 customers.
  · **Erasure anonymises, it does not delete.** Deleting a customer either
    orphans their orders or cascades and destroys them, and both are wrong: a
    business must keep the transaction for years after the person asks to be
    forgotten. Those obligations do not conflict — the transaction is not the
    person. `CustomerAnonymiserService` keeps every figure (totals, dates,
    items, refunds, district) and scrubs every identifier (name, phone, email,
    password, addresses, AND the contact details snapshotted onto each order at
    checkout, which is the copy people forget).
  · **It refuses while an order is live.** A parcel in transit needs a name and
    a phone on it, or nobody can deliver it. That is not bureaucracy; it is the
    difference between forgetting someone and losing their parcel.
  · **`customer_erasures` records that a request was honoured and stores NO
    identifiers** — a log that recorded who was erased would be a way of
    un-erasing them. No foreign key, because the record must outlive the row.
  · **Owner-only, and hidden rather than disabled** for everyone else. A control
    that refuses the person looking at it is only a source of confusion.
  · Search covers name/phone/email only — a wildcard across every column turns
    a support tool into a way to trawl for people in a particular area. The
    screen says at the top that these are real people's details.
  · Lifetime spend and averages count PAID orders only, so abandoned
    cash-on-delivery attempts do not flatter a customer's record.
  · 34 pages 200 · 136 PHP files clean · no console errors · no overflow at
    375/768/1280/1440.
- **2026-07-28** — 7.5 part one: `modules/inventory` + the product cost field.
  · **Stock is a ledger, not a counter.** `stock_movements` is the truth;
    `stock_levels` is a running total written in the same transaction, so it can
    be rebuilt from the ledger and a disagreement is a bug with an audit trail.
    There is deliberately NO endpoint that sets a quantity — a stocktake records
    the DIFFERENCE with reason `count`, because "the shelf says 38, the system
    said 41" is the useful fact, and repeated corrections in one direction are
    how theft is noticed.
  · **Reserved vs on hand.** Reserving does not move stock (it has not moved),
    but it stops the last jar being sold twice between order and despatch.
  · **Negative on-hand is allowed and shown.** It happens — a sale booked before
    a delivery. Forbidding it in the schema hides the error; showing it makes it
    findable.
  · **Reasons are a closed list and the sign is checked against them.** A
    negative receipt or a positive sale is a flipped sign upstream, and catching
    it is what keeps a shrinkage report worth reading.
  · **`products.cost_poisha` added, nullable, never defaulting to zero** — a
    zero cost makes every sale look like 100% margin, which reads as good news
    and so never gets questioned. It is a STANDARD cost; COGS will use the
    weighted average of real receipts in `stock_movements.unit_cost_poisha`.
    `averageCostPoisha()` returns null today and callers must say "cost not
    recorded" rather than substitute the selling price. This is the 7.6 blocker
    (§8b/B5) made concrete.
  · **`Product::toAdminArray()` is separate from `toStorefrontArray()`** so cost
    cannot reach a customer's browser by someone adding a field to the wrong
    array. Cost tells a customer how much room there is to haggle and tells a
    competitor our supplier terms.
  · 36 pages 200 · 149 PHP files clean · no console errors · no overflow at
    375/768/1280/1440 · graph one-way (`inventory -> catalog`).
  · STILL TO DO in 7.5: the admin product-edit screen.
- **2026-07-28** — 7.5 part two: product editing.
  · **Editing is scoped to what changes week to week** — price, cost, stock
    flag, copy, listed/unlisted. NOT sku, barcode, origin or category: those are
    identity, and a screen that lets a busy person retype a barcode is the
    screen that eventually breaks the one verifiable promise the Sourcing page
    makes to customers.
  · **`product_price_changes` logs every price and cost move with a name.** A
    price is the field customers screenshot; "it was ৳ 1,200 yesterday" is a
    real conversation and without a log the only honest answer is a shrug.
    Orders already snapshot what was charged, so this is about explaining the
    shelf price, which is a different question.
  · **Empty cost is null, never zero, all the way through** — form placeholder,
    PATCH body, column and margin calculation. `marginPercent()` returns null
    when cost is unknown, and both screens print "not recorded" rather than a
    dash that reads as zero.
  · **The list leads with a missing-cost count and a one-click filter for it**,
    turning §8b/B5 from a vague blocker into a worklist somebody can finish.
  · The edit form PATCHes only what changed — resending every field would write
    a price-history row each time someone opened the form and saved, burying the
    real changes.
  · 38 pages 200 · 152 PHP files clean · no console errors · no overflow at
    375/768/1280/1440 · storefront unaffected.
- **2026-07-28** — 7.6 accounting (`modules/accounting`).
  · **One rule, enforced in code inside the write transaction:** debits equal
    credits. A ledger that can be one poisha out cannot be reconciled, and
    nobody finds out until year end.
  · **Posted entries are immutable.** No update route, no delete route — a
    mistake is fixed by `reverse()`, which writes a mirror entry dated TODAY
    (not backdated, which would change a period already reported on) and links
    both ways. An accountant must see the same numbers today they saw then.
  · **Debit and credit are two unsigned columns, not one signed amount.**
    "Debit 500" and "credit -500" are identical to a computer and completely
    different to an accountant, and every report and conversation about these
    books will be in debit/credit terms.
  · **`(source_type, source_id)` is unique** — the guard against double-posting
    a sale, which is the most common way automated bookkeeping goes wrong.
  · **Revenue is recognised on PAID, not placed.** COD debits a courier
    receivable rather than cash, because the money is not ours until it is
    remitted. Delivery income is a separate account from goods, so "does
    delivery pay for itself" is answerable.
  · **THE HONESTY POINT.** `postSale()` omits the cost-of-goods lines entirely
    when any line's cost is unknown, and `profitAndLoss()` then returns
    `grossProfitTaka: null`, `costOfGoodsKnown: false`, a count of affected
    sales, and a written caveat IN THE PAYLOAD so every consumer carries it.
    The screen renders the caveat ABOVE the figures and does not draw a gross
    profit card at all — a card showing "—" leaves a profit-shaped hole that
    eyes fill in. The net line is relabelled "Income less recorded expenses".
    Assuming zero cost would post every sale at 100% margin: a confident,
    flattering, wrong number that nobody questions.
  · Partial COGS is treated as unknown too — costing only the lines we know
    understates cost and overstates profit, the same lie with better cover.
  · Chart of accounts is data (21 accounts). Renaming is allowed; retyping a
    system account is not, because it would silently rewrite every P&L ever
    produced. Opening balances deliberately NOT seeded — zeroes would look like
    a real starting position.
  · 40 pages 200 · 166 PHP files clean · no console errors · no overflow at
    375/768/1280/1440 · graph one-way (`accounting -> checkout`).
- **2026-07-28** — 7.7 CMS, and Phase 7 is complete.
  · **Overrides, not source.** The authored HTML remains the content; a row says
    "wherever data-cms=X appears, show this instead". Delete a row and the page
    returns to what the developer wrote; delete the module and every page still
    renders as authored. That is what makes it safe to hand to a non-technical
    editor — the worst outcome is wrong words, never a broken page.
  · **THE KEY INSIGHT: the safety rule and the no-layout rule are the same
    rule.** The renderer may only set `textContent`, or a validated image
    `src`/`alt`. `textContent` never parses HTML, so a `<script>` typed into a
    headline is displayed as characters — there is no sanitiser to get wrong
    because nothing is ever parsed. And no markup means no layout. An `html`
    content type would not be a small convenience; it would remove both
    guarantees in one change. There is deliberately no rich-text editor.
  · **Image paths are validated on both sides** — same-origin, under /assets/
    or /uploads/, rejecting `://` and `//` prefixes before any "starts with /"
    check. An arbitrary src turns every visitor into a request to somebody
    else's server.
  · **`tools/annotate-cms.py` generates the keys** rather than hand-typing
    hundreds. It skips nodes with element children (a key must own the WHOLE
    text it replaces, or a paragraph containing a link loses the link) and nodes
    with other `data-*` attributes (JS owns those; an override would be
    overwritten on the next render and look like a failed save). Keys carry a
    hash of the original text, so inserting a paragraph does not renumber its
    neighbours' overrides onto the wrong sentences.
  · **Editing happens on the live page**, because a headline is only judgeable
    at the width and in the place it appears. Gated on `?edit=1` AND a session
    the server recognises — verified all three states: normal visitor unaffected,
    `?edit=1` without a session refuses with a reason, with a session marks 13
    nodes.
  · Revisions keep the previous value so a bad Friday-afternoon edit is one
    click back; reverting deletes the override entirely, restoring the
    developer's original, which is never stored in the DB and so cannot be lost.
  · 40 pages 200 · 175 PHP files clean · no console errors · no overflow at
    375/768/1280/1440 · all four generators green.
- **2026-07-28** — Guest wishlist merge on sign-in (storefront follow-up).
  · **The bug:** `wishlist_items` requires a `user_id`, so a guest has no
    server-side wishlist — theirs lives in localStorage. The cart merged on
    sign-in; the wishlist did not. Someone who saved six things and then created
    an account arrived at an EMPTY wishlist, with the items still in their
    browser, invisible, until localStorage was cleared and they were gone. Quiet
    data loss at exactly the moment a customer decides to trust the site.
  · Fixed as a one-way push: `POST /api/account/wishlist/merge` takes the SKUs
    the browser holds. Idempotent by the unique (user_id, product_id) index, so
    a retry or a second sign-in adds nothing twice. Capped at 200 — a wishlist
    is a human list, and an uncapped client array is an invitation.
  · **Withdrawn products are skipped, not fatal.** A wishlist saved months ago
    contains things since delisted, and losing the whole merge over one of them
    would be worse than losing that one. The count of skipped items is reported
    and shown ONLY when non-zero — "2 are no longer available" is the thing the
    customer would otherwise notice and not understand.
  · **Merge failure never blocks sign-in.** Both merges swallow their own
    errors, and nothing is cleared from localStorage on success either, so the
    next sign-in tries again. Verified with no backend: merge returns ok:false
    and the local list is intact.
  · `signIn()` became async, so both call sites now await it — an unhandled
    rejection there would have been invisible.
  · 40 pages 200 · 176 PHP files clean · no console errors · all generators green.
- **2026-07-29** — B2B desk notification when an RFQ arrives (storefront follow-up).
  · **The problem:** a quote request was stored and nobody was told.
  · **The obvious fix is an email, and there is no mail credential (§8b/B2).**
    So the fix that actually works today is to make an unanswered request
    impossible to walk past: a count on the dashboard every staff member sees on
    sign-in, and an inbox ordered OLDEST-FIRST. Newest-first would bury the
    request that has waited three days under the one from this morning — and the
    old one is the one costing money.
  · That is not a stand-in for email. For a desk of two or three people it is
    the better alert, because it cannot be marked read and forgotten: the count
    stays up until the request is actually moved on. Email is an addition when
    there is something to send it with, and the screen says so plainly rather
    than leaving someone to conclude the feature is broken.
  · Waiting time is shown per row and turns red past 24 hours — a B2B enquiry
    that waits two days has usually already phoned somebody else.
  · `responded_at` is stamped the FIRST time a request leaves `new` and never
    overwritten, so "how long did we take to respond" stays answerable.
  · **Route-stack split:** the storefront's quote endpoints are stateless JSON
    on `api`; the admin inbox authenticates with a session cookie and needs the
    `web` stack. One file cannot be on both, so `admin-routes.php` is separate.
  · 41 pages 200 · 178 PHP files clean · no console errors · no overflow at
    375/768/1280/1440 · all four generators green.

### 8.1 done — and one thing it exposed

`modules/catalog/backend/api.js` (the frontend seam) still reads
`data/products.json` and `data/categories.json`. The Laravel API exists and
works, but **the storefront is not calling it yet** — so the shop reads JSON
while the admin panel reads the database.

That split has to close before category on/off actually affects the shop: today
a merchant switching a category off in the panel changes the database, and the
storefront never looks. **This is now the first job of 8.2.**

Also: `deploy.sh` deliberately does not seed, so the 9 new categories only reach
the live database when `db:seed` is run once by hand (a one-off cron).

### 8.7 started — mobile hero (2026-07-30)

Measured before: at 390px the hero was **702px tall and the first content
section began at 1042px** — more than a full phone screen of scrolling before a
single product or category appeared.

Cause: `height: clamp(460px, 78vh, 760px)`. 78vh is a sensible desktop
proportion and a poor mobile one — a phone viewport is tall and narrow, so the
same fraction is far more vertical space.

Fixed with two mobile steps (<640px and <380px): absolute heights, tighter type,
a 34ch measure instead of 48ch, and full-width buttons. Result:

| width | hero before → after | content starts |
|---|---|---|
| 360 | 702 → **400** | 1042 → **782** |
| 390 | 702 → **460** | 1042 → **800** |
| 768+ | 702 (unchanged) | unchanged |

**RESOLVED — there was no clipping.** Measured every element's computed edge:

| at 390px (clientWidth 380) | left | right |
|---|---|---|
| hero button | 24 | 356 |
| trust strip | 24 | 356 |
| hero content | 24 | 356 |

Same proportions at 360. Nothing reaches the edge. The screenshot misled because
a headless window of 390 renders a 380px viewport once the scrollbar is taken,
and the capture is scaled — so content that ends at 356 can look cut off.

**Lesson worth keeping: measure computed edges, do not trust a screenshot for
overflow.** Had this been "fixed" on the strength of the image, the hero would
have been narrowed for no reason.

Remaining 8.7 work: category tiles, product cards, PDP, cart and checkout on
mobile; hover/press effects; alignment pass.
