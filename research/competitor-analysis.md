# Bangladeshi E-commerce — Competitive Teardown

> Research date: **2026-07-25**. Three reference sites studied for the GulfRabit build:
> **Shajgoj** (beauty vertical), **Ghorer Bazar** (organic-food D2C), **Daraz** (marketplace).
>
> Everything here was verified live — raw HTML, CSS/JS bundles, response headers, cookies
> and open JSON endpoints — not summarised from memory. Where a claim could not be
> confirmed it is marked *inferred* or *unverified*.
>
> The three were chosen because they sit at three different points on the same axis:
> Ghorer Bazar = **trust-first D2C**, Daraz = **scale-first marketplace**, Shajgoj =
> **content-first specialist**. GulfRabit needs the trust mechanics of the first, the data
> contracts of the second, and the editorial discipline of the third.

---

## Part 1 — Ghorer Bazar (ghorerbazar.com)

Organic/pure-food D2C. Positioning is **anti-adulteration**, not price or convenience:
*"Recognizing a growing concern over food safety and chemical contamination, we set out to
source foods from regions known for purity."* Ghee, honey, dates, mustard oil, nuts, spices,
rice. High AOV for BD grocery — ৳1,500–2,700 for a single hero SKU.

**Access note:** behind Cloudflare bot management. Bare `curl` and normal fetching get
**403**; a browser User-Agent gets 200. Origin also throws intermittent **520**s.

### 1.1 The single most important structural fact

The website is **one of five order channels, not the funnel.** Quoted verbatim from
`/page/how-to-order`: Website · **WhatsApp** (`+8801321208940`) · **Facebook Messenger** ·
**Phone hotline** (`09642 922 922`) · Live chat.

Everything else about the site follows from that.

### 1.2 Feature inventory

**Discovery**
- Mega-menu, two-column sub-category layout. 10 top-level categories, ~14 sub-collections.
- **Live predictive search** (AJAX) showing thumbnail (50×50) + 2-line-clamped title +
  price + strikethrough compare-at. Has explicit `.search-loading` and
  `.search-no-results` states.
- **Separate full-screen mobile search modal** sliding from `top:-100%`.
- Faceted collections: sub-category, price slider (৳0–5,000), brand, product flag
  (Best Selling / New Arrival), Clear All. Sort: Default / Latest / Oldest / Price ↑ / Price ↓.
  Per-page 16/20/24/36. "Load More" pagination.

**Product page**
- Swiper gallery + lightbox; card hover swaps to a second image.
- **Variant selector with sold-out styling** (`pointer-events:none` + cross-out).
- **Add-on system** including **image-upload add-ons**, with a live
  "Base ৳X + Addon ৳Y = Total ৳Z" calculator.
- **Four CTAs**: Add to Cart · Buy Now · **Order on WhatsApp** · **Call for order**.
- **"Frequently bought together"** — first item `checked disabled` as the anchor, others
  pre-checked and removable, live total and "Save ৳N".
- Reviews with average, **"% Recommended"**, and a 5-bar distribution histogram.
- **EMI modal** with bank selector and per-plan cost table. Offer countdown timer with
  `backdrop-filter: blur(5px)`. Size-chart modal. Related + Cross-sell rails.
- `Product` JSON-LD with `priceCurrency: BDT`.

**Answering the "BD order-form" question — they do NOT use one.** No name/phone/address
form on the PDP. They run a conventional cart → checkout. Their substitute is the
**pre-filled WhatsApp deep link**, which carries the whole context into the message:

```
https://wa.me/8801321208940?text=Hello! GhorerBazar, I'm interested in:
Product: Gawa Ghee 1kg
Price: 1800
SKU: A000011
Product URL: https://ghorerbazar.com/products/gawa-ghee-1kg
```

That is the social-commerce order form, relocated into WhatsApp.

**Cart** — slide-in off-canvas drawer only; `/cart` as a page **404s**. Auto-opens on add
via a `side_cart_auto_open` flag in the JSON response. Endpoints: `/add/to/cart/with/qty`,
`/update/cart/qty`, `/remove/cart/item/{id}`, `/combo/remove-from-cart`, `/combo/update-cart-qty`.
- **Gift-with-purchase threshold** live in the drawer:
  *"Get 500ml Mustard Oil — Add ৳3,000 more to unlock!"*

**Checkout** — single page, `POST /place/order`, guest by default. Only **five** required
fields:

| Field | Required | Note |
|---|---|---|
| `name` | ✅ | |
| `phone` | ✅ | placeholder `017********` |
| `email` | ❌ | explicitly labelled `(Optional)` |
| `shipping_address` | ✅ | |
| `shipping_district_id` | ✅ | 64 districts |
| `shipping_thana_id` | ❌ | |
| terms checkbox | ✅ | |

Hidden defaults `delivery_method=1`, `payment_method=cod`. Also: guest saved-address
recall keyed on phone (`/check/guest/addresses`), wallet balance, coupon, 90-char note.

**Payments** — COD (default) · **SSLCommerz** online · **bKash**. No Nagad, no Rocket.
**Partial payment is enabled** with three plans — 50% advance, 75% advance, full advance —
each carrying a **"Payment Plan Discount"** line item.

**Delivery — verified live** by querying `POST /change/delivery/method` across districts:

| Zone | Charge | Duration |
|---|---|---|
| Dhaka **and Chattogram** city | **৳70** | 72 hours |
| Everywhere else (incl. Gazipur, Narayanganj) | **৳130** | 4 working days |
| Express (Dhaka only) | ৳100 *(stated)* | — |

Flat **regardless of order value** — no free-shipping threshold anywhere.
**⚠ Confirmed bug:** the express API returns **"Free"**, contradicting the stated ৳100.

**Auth** — **OTP-first** (`POST /send/otp`) with username/password as fallback, plus social
sign-in. Guest order tracking at `/track/order`, linked in the header. reCAPTCHA on both
forms with the badge CSS-hidden.

### 1.3 Frontend stack

**Platform: getCommerce 3.0.0 by Softifybd — confirmed three ways:** `<meta name="generator"
content="getCommerce 3.0.0">`, `window.getCommerce = { version: '3.0.0' }`, and a footer
credit linking to `getcommerce.xyz`.

**Underlying framework: Laravel**, proven by cookies — `XSRF-TOKEN` and
`ghorerbazar_session`, both base64 JSON `{iv,value,mac,tag}` (Laravel's `encrypt()`
envelope), plus `_token` hidden inputs and a 419 `"CSRF token mismatch."` on a bad token.
**Definitively not Shopify and not WooCommerce** — `/products.json`, `/cart.js`, `/meta.json`
and `/wp-json/` all fail.

**Rendering: fully server-rendered Blade.** No React/Vue/Next/Nuxt/Alpine/Livewire.
Interactivity is jQuery + AJAX **partial-HTML swaps** — responses return
`rendered_cart` as an HTML string, not JSON state.

**The notable CSS architecture — numbered style variants:**

```
/assets/css/home-page/header/header-style-7.css
/assets/css/home-page/footer/footer-style-3.css
/assets/css/home-page/product-card/card-style-6.css
/assets/css/home-page/bottom-navigation/style-1.css
```

A **SaaS theme-picker pattern** — the merchant selects header 7, card 6, footer 3 from
admin. (`product-section-style-4.css` is `<link>`ed **six times**.)

**Fonts** — only **Open Sans**, Google Fonts, variable axis 300–800, `display=swap`, with
correct preconnects. **No Bangla webfont is loaded at all**, and `card-style-6.css`
declares `font-family: Poppins` which is **never loaded**.

**Images** — served from `backoffice.ghorerbazar.com`, **no transformation CDN**.
Dimensions are baked into filenames manually (`…-1000x400.png`).

| Metric | Homepage |
|---|---|
| `<img>` count | **111** |
| `srcset` | **0** |
| `<picture>` | **0** |
| `loading="lazy"` | 34 / 111 |
| explicit `width`/`height` | **1** / 111 |

Predominantly PNG/JPEG — only 3 WebP, zero AVIF. Measured: a **640 KB** PNG, **525 KB**,
**515 KB**, **324 KB**.

**Analytics — genuinely sophisticated.** Cart AJAX responses carry a server-built
`tracking_data` payload replayed by `window.TrackingManager`:

```json
{"event":"add_to_cart","currency":"BDT",
 "item":{"item_id":"A000011","item_name":"Gawa Ghee 1kg","item_brand":"Shosti food",
   "item_category":"Oil & Ghee","item_category2":"Ghee",
   "item_category3":"Cooking Essentials","item_category4":"Offer Zone"},
 "customer_data":{...}, "page_data":{...}}
```

Four-level category hierarchy, GA4-schema-correct, with a `customer_data` block shaped for
**Meta Conversions API advanced matching**. For a Facebook-ads-led business this is exactly
the right investment. GTM `GTM-MZ35XKQV`, GA4 `G-G0RFFMB1LS`, Meta Pixel `2813877952276876`.

### 1.4 Backend / infrastructure

```
Server: cloudflare            (edge: DAC — Dhaka, correct in-country PoP)
Cache-Control: no-cache, private
Set-Cookie: XSRF-TOKEN=…; secure; samesite=lax
Set-Cookie: ghorerbazar_session=…; httponly; secure; samesite=lax
X-Frame-Options: SAMEORIGIN   X-Content-Type-Options: nosniff
cf-cache-status: DYNAMIC
```

Origin software is hidden (no `X-Powered-By` leak) — good. Brotli compression takes the
homepage **389 KB → 43 KB**. TTFB ≈ **490 ms**.

The checkout page ships a **self-documenting API map** in a `CONFIG.urls` object:
`/change/delivery/method`, `/district/wise/thana`, `/apply/coupon`, `/check/guest/addresses`,
`/apply/wallet/balance`, `/apply/partial/payment/discount`, plus
`deliveryMethods: {1:'home_delivery', 2:'store_pickup', 3:'express_delivery'}`.

**Security headers — audit:**

| Header | |
|---|---|
| `X-Frame-Options` | ✅ |
| `X-Content-Type-Options` | ✅ |
| `Strict-Transport-Security` | ❌ **missing** |
| `Content-Security-Policy` | ❌ **missing** |
| `Referrer-Policy` / `Permissions-Policy` | ❌ missing |

No HSTS on a site taking bKash and cards leaves a TLS-stripping window on first visit.
Also: **`/sitemap.xml` returns 520** and `robots.txt` declares no `Sitemap:`.

### 1.5 Responsiveness

Breakpoint ladder from `style.css` (528 KB raw): `max-width` rules outnumber `min-width`
roughly **2:1** — a **desktop-first codebase retrofitted for mobile**. Main stops:
479 / 575 / 767 / 991 / 1199 px down, 576 / 768 / 992 / 1200 px up.

**Two invalid media queries shipped to production**, both silently dead:
```css
@media (max-width: 991) and (min-width: 480px)          /* missing "px" */
@media (max-width: 800px) and (orientation: landscape), /* dangling comma */
```

But the **mobile components are excellent**:
- **Bottom sticky nav** (mobile-only): Home · Menu · Cart · Search · Account, with
  `flex: 1` per child so tap targets are equal-width (~72px on a 360px screen).
- **Sticky cart pill** with live count + running total and a bounce animation.
- **Floating search FAB** deliberately offset `bottom: 80px` to clear the bottom nav.
- `html { font-size: 62.5% }` with `.btn { font-size:1.4rem; padding:0.93em 1.98em }`
  → **≈44px tall**, exactly the WCAG/Apple minimum.

Verdict: components are mobile-first, the CSS architecture is not. Given ~93% BD traffic
on mid-range Android, the **~1.76 MB of uncompressed CSS+JS** is the wrong payload.

### 1.6 UI/UX design system

Platform defaults live in `variable-colors.css`; the merchant's brand is **injected inline
with `!important`** — a clean multi-tenant theming approach:

```css
:root {
  --primary-color:   #f48721 !important;  /* saffron/marigold orange */
  --secondary-color: #041f1e !important;  /* near-black deep teal */
  --title-color:     #222831;
  --paragraph-color: #252a34;
  --success-color:   #34be82;   /* "Save X%" badges */
  --alert-color:     #ff1818;
}
```

`#f48721` is culturally well-chosen — turmeric, ghee, honey and mustard oil all sit in that
hue family, so it reads as appetising rather than corporate.

**⚠ The consequential defect:** `h1–h6 { color: var(--primary-color) }`, and `#f48721` on
white is roughly **2.4:1** — **every heading on the site fails WCAG AA**.

**Type:** `html{font-size:62.5%}` (1rem = 10px), body Open Sans 14px/1.6 `#666`.
h1 40px → h6 13px desktop; **h6 is larger than h5 on mobile** (a scale inversion bug).

**Radius:** ten different values in use; cards `4px`, **buttons `border-radius: 0`** —
squared buttons beside rounded cards. Base button is outline/squared/uppercase, which
reads dated.

**Product card (`card-style-6`)** — dual-corner badge grammar: orange status flag
top-left ("Best Selling"/"New Arrival"), green discount top-right ("Save 12%"), both
10px, `padding: 2px 6px`, `border-radius: 4px`. Image zooms 1.04× on hover and swaps to a
second image. Clean and effective.

**Trust stack, in order of appearance:** hotline in header → Call/WhatsApp rail → a
collection literally named **"Certified"** → badges → strikethrough anchor pricing →
countdown timers → Flash Sale as permanent nav → bundle savings math → gift threshold →
review histogram → **named testimonials with occupations** ("Ahmod Al Kamran, *Student*";
"Sultana Yesmin, *Housewife*") → COD default → guest tracking → provenance copy
("sourced from the renowned **Pabna** region").

### 1.7 The strategic contradiction worth noting

Despite a Facebook-led, Bangla-language brand persona, **the storefront is overwhelmingly
English**:

| Page | Bangla tokens | Latin words |
|---|---|---|
| Homepage | 57 | 744 |
| Product page | **0** | 491 |
| Checkout | **0** | 830 |

Bangla appears **only** in five homepage testimonials. **No language switcher, no Bangla
webfont.** The Bangla-speaking audience their ads acquire lands on an English store.

### 1.8 Weaknesses

- **~1.76 MB uncompressed CSS+JS.** `uicons.css` alone is **729 KB** — and **FontAwesome
  (53 KB) loads alongside it**. Two full icon systems.
- 111 homepage images, **zero `srcset`**, one `width`/`height` pair (guaranteed CLS),
  4000×1040 desktop heroes served to 360px phones.
- **Accessibility:** **108 of 164 homepage buttons have no text and no `aria-label`**.
  **Zero `<h1>`** on the homepage. `maximum-scale=1` **blocks pinch-zoom** (WCAG 1.4.4),
  and the viewport tag is malformed (missing comma before `viewport-fit`).
- **FAQ is unedited platform boilerplate** that contradicts reality — it promises cards and
  "SSLCommerez" *(sic)* while never mentioning COD or bKash, the two methods everyone uses.
- Placeholder social links shipped live: `href="https://x.com"`, `href="https://www.messenger.com"`.
- Typos in production: `<select name="rarting">`, JSON key `p_qauntity`.
- Validation errors appear as **top-right toasts detached from the field at fault**.

---

## Part 2 — Daraz Bangladesh (daraz.com.bd)

The scale benchmark: a pure **multi-vendor marketplace**, Alibaba-owned, built on
**Lazada's codebase**. Their T&Cs state the sale is *"a strictly bipartite contract between
you and the sellers"* — Daraz is a facilitator, not the merchant.

**That single sentence explains the entire UI.** If Daraz doesn't own the inventory, it
cannot promise quality — so instead it **sells you the tools to assess risk yourself**:
seller scorecards, Q&A, photo reviews, warranty classes, and a paid trust tier.

**Lineage is provable, not guessed:** the CSS ships `.lzd-*` classes with a
`.daraz-pc-theme-style` overlay, the search backend self-identifies as `LazadaMainSrp`, the
Daraz Mall badge's internal type is literally **`lazMall`**, deep links point at
`native.m.lazada.com`, and edge nodes report `Via: wormhole-cache…lazada-sg.os30`.
Daraz BD is a **white-label skin over Lazada**.

### 2.1 The open search API — the most valuable find

**`https://www.daraz.com.bd/catalog/?ajax=true&q=<query>` returns the complete page model
as unauthenticated JSON.** Shape:

```
{ templates[], mods{ filter, listItems, breadcrumb, sortBar, resultTips },
  seoInfo{ pageTitle, canonicalHref, itemListSchema, productSchema } }
```

**Facets** (from `q=t-shirt`) with their real `urlKey`s:

| Facet | urlKey | Notes |
|---|---|---|
| Category | `category` | 20 leaf options |
| Brand | `ppath` | 27 options |
| Size | `ppath` | EU / INT grouping |
| **Service & Promotion** | `service` | `mall`, `freedelivery`, `Voucher_Max`, `bundleSave`, `coins` |
| **Shipped From** | `location` | 8 BD divisions |
| Price / Rating | `price` / `rating` | |
| Color Family | `ppath` | 28 options |
| **Warranty Type** | `ppath` | No / Seller / International Seller / Brand / International Manufacturer |

**The `ppath` encoding is `propertyId:valueId`** — `30129:3731` = Color:Black,
`31386:4653` = Material:Cotton. **One generic URL parameter carries every attribute facet**,
comma-joined for multi-select. Facets are **generated from each category's attribute
schema** — smartphones get RAM / Battery mAh / Camera MP / Storage; t-shirts get
Material / Colour / Fit. No hand-built filter pages.

**Sort has only three options** — Popularity (Best Match), Price ↑, Price ↓.
**No "Newest", no "Top Rated"** despite collecting both. Striking omission at this scale.

**Query understanding:** Bangla-script queries work cross-lingually (`q=শার্ট` returns
shirts) and `serverParams` carries `translatedEnQuery` — there is a **translation layer in
front of the index**.

**Pagination:** `pageSize: 40`, and **`totalResults` is hard-capped at exactly 4080**
(102 × 40) for *every* query — while `resultTips` simultaneously reports the true count
(38,290 / 37,585 / 22,952). A deliberate deep-pagination cap; the honest number appears
only in prose.

### 2.2 Product card contract — worth copying wholesale

```
name, itemId, image, priceShow ("৳ 210"), originalPrice, discount ("47% Off"),
ratingScore (raw float), review, itemSoldCntShow ("8.9K sold"), location ("Dhaka"),
sellerName, sellerId, brandName, inStock, skus[], icons[], description[],
isSponsored, adFlag, directSimilarUrl, itemUrl, clickTrace
```

Note `ratingScore` ships as an **unrounded float** rounded client-side, and long-tail items
carry `ratingScore: null`.

### 2.3 The badge system — genuinely unusual

Badges are **not composed client-side**. The server returns **pre-merged combination
tokens**, each mapping to one image asset:

```
lazMall · campaign · coins · coinsAndFreeshipping
FreeshippingAndVoucherMax · FreeshippingAndCoinsAndVoucherMax
```

…with a `group` field acting as a **slot index**. "Free Delivery + Coins + Voucher Max" is
*one pre-rendered image*, not three chips. This caps badge-row width deterministically,
guarantees **zero layout shift**, and lets marketing ship new badge combinations without a
frontend deploy.

### 2.4 Feature inventory (marketplace-scale)

- **PDP:** gallery, multi-axis variant matrix, collectible **voucher chips**, **Bundle
  Deals**, a **delivery-location selector (division → district → area) that recomputes
  shipping fee + ETA**, COD availability line, return/warranty block, **seller card with
  Chat Now / Visit Store + three-metric scorecard**, specs table, reviews with photos and
  star filtering, and buyer-asked/seller-answered **Q&A**.
- **Cart/checkout:** line items **grouped per seller**, **per-seller vouchers**, shipping
  computed **per seller shipment** — one order fragments into N shipments, N fees, N ETAs,
  N tracking numbers.
- **Payments:** COD (flagship), Visa/MC/Amex, **bKash, Nagad, Rocket, DBBL Nexus**,
  **EMI (0% markup, 3/6/12mo, ~৳10,000 minimum)**, Daraz Voucher as a tender, co-branded
  Daraz Card.
- **Returns — the best-documented area anywhere in this research.** 14-day window; a
  formally named, **category-by-category "Change of Mind" policy** (allowed for fashion,
  forbidden for electronics/jewellery/beauty); a condition bar including *"no tape on the
  box"*; and a **per-tender refund matrix**: Card 10 working days · Rocket 7 · DBBL Nexus 7
  · bKash 5 · Nagad 5 · **COD → bank deposit, 5 days** · Voucher → refund voucher, 1 day.
  **Cashback is clawed back out of refunds.**
- **Gamification (mostly app-only):** Daraz Coins via daily check-in and Missions,
  **Daraz Candy** (a match-3 game), **Shake Shake**, Mystery Box, Loyalty Club,
  **DarazLive** livestream shopping — and the app doubles as a **free live cricket/BPL
  stream**.
- **Support:** buyer↔seller **Chat Now** as core infrastructure (also the official warranty
  claim channel and a ranked seller metric), plus **"Daz"**, an Alibaba AliMe chatbot at
  `ai.alimebot.daraz.com.bd`. No public phone or email.
- **Regulatory:** footer carries **Registration ID 304903094**, a DBID badge, and a live
  link into the government **CCMS complaint portal** (`ccms.gov.bd`) — a trust-deficit tell.
- Three app stores including **Huawei AppGallery**, which matters in a Chinese-handset market.

### 2.5 Frontend stack

**Not Next.js, not Vue, not modern bundler output** — zero `__NEXT_DATA__`, zero
`next/static`, zero webpack manifests.

- **React — three versions concurrently in production:** `16.8.0` (homepage legacy),
  `17.0.2` (search/category/PDP), `@ali/pnpm-react/18.2.0` (header/footer). Different pages
  boot different Reacts.
- **ICE.js** (Alibaba's React framework) — `window.__ICE_APP_CONTEXT__`.
- **GCP ("Generic Container Platform")** — a server-driven page-assembly layer
  (`window.gcpMarks/gcpStartConfig/gcpLoadingHtml`). Campaign pages are **authored as
  data**, not code — which is how an 11.11 landing page ships without a deploy.
- **Module loading = combo-CDN, not bundling.** Assets load as
  `//g.lazcdn.com/g/??a.js,b.js,c.js` — the `??` syntax concatenates dozens of
  independently-versioned packages into one response **at the edge**. Every team ships its
  own semver'd package; the CDN assembles the bundle at request time. The pre-ESM answer to
  module federation.
- **Rendering is hybrid per page type:** homepage **SSR-heavy** (527 KB HTML); category/
  search a **thin 57 KB shell + CSR** hydrated from the `ajax=true` JSON; PDP an SSR shell
  + CSR hydration via mtop, explicitly instrumented (`window.__pdpMtopStartTime`,
  `__pdpHydrateStatus`).
- **CSS Modules** with hashed suffixes (`.search-box__input--O34g`) over `.lzd-*` globals.
  No utility framework. Theming is a single class: `.daraz-pc-theme-style { background-color:#f85606 }`.

**Images — the convention worth stealing verbatim:**

```
{path}/{hash}.jpg_{W}x{H}q{Q}.jpg[_.webp|_.avif]
e.g. .../S1a97…o.jpg_400x400q80.jpg_.avif
```

Observed ladder `80 · 150 · 170 · 360 · 400 · 720 · 2200`, always `q80`, with **AVIF, WebP
and JPG variants of every size** selected via `<picture>`. Declarative, stackable,
infinitely cacheable.

**Third-party scripts: essentially none.** Analytics is entirely first-party Alibaba —
`aplus`, `goldlog`, SPM click-attribution via `data-spm`, `woodpeckerx` RUM, `itrace` for
JS errors and blank-screen detection. **No Google Analytics, no GTM, no Facebook Pixel, no
Hotjar** in the server HTML.

**⚠ The font finding that should embarrass a Bangladesh-first platform:** the `@font-face`
family is named **`NotoSans-Regular`** but the `src` loads **`EuclidCircularA-Regular.woff2`**.
Header CSS uses **`Roboto-Regular`**, self-hosted with subsets for **cyrillic, cyrillic-ext,
greek, greek-ext, vietnamese, latin, latin-ext — and no Bengali subset at all.** There is
**zero `unicode-range` covering U+0980–09FF** anywhere in their CSS. Daraz Bangladesh ships
**Greek and Cyrillic webfonts to Dhaka but no Bengali font**, while Bangla is the *mobile
default language*.

### 2.6 Backend / infrastructure

- **Server:** `Tengine/Aserver` (Alibaba's nginx fork), tracing via `EagleEye-TraceId`.
- **Edge:** Lazada **Singapore**, not in-country — `Via: wormhole-cache…lazada-sg.os30`,
  `X-Cache: HIT TCP_MEM_HIT`. Internal cluster leaks as `cluster: "fiber2_os30"`.
- **DNS proves the ownership chain:** `www.daraz.com.bd` → `daraz.wagbridge.alibaba-inc.com`
  → `…aserver-lazada.alibaba.com.gds.alibabadns.com`.
- **API gateway = mtop** (Alibaba's Mobile Taobao Open Platform), `lib-mtop 2.7.3` at
  `acs-m.daraz.com.bd`, called as `/h5/{api}/{version}/`. **Requests are signed** — unsigned
  probes return 500. Real API names in the HTML: `mtop.lazada.detail.get`,
  `mtop.lazada.recommend.hp.jfy.service`, `mtop.lazada.promotion.voucher.spread`,
  `mtop.com.lazada.stars.prod.generic.service.strategy.touch` (a generic campaign-targeting
  engine).
- **Caching:** `max-age=60, s-maxage=120` on HTML — a **2-minute edge TTL on the homepage**.
  `Vary: … , User-Agent`.
- **Locale cookie is server-signed:** `hng=BD|en-BD|BDT|050` plus **`hng.sig`**, an HMAC —
  tamper-evident locale/currency.
- **Bot protection:** Alibaba **Baxia**, **UMID** device fingerprinting, **UAB**, and
  **Ebuckler** — applied to *transactional* surfaces only, **not** catalogue reads, which is
  why the search API scrapes trivially.
- **Security headers — thin.** Present: HSTS `max-age=31536000`, `x-frame-options`,
  `nosniff`, `x-xss-protection`. **Absent: CSP, Referrer-Policy, Permissions-Policy**, and
  HSTS has no `includeSubDomains`/preload.

### 2.7 Responsiveness — the headline architectural finding

**Daraz's desktop site is not responsive at all, and mobile is a different codebase served
from the same URL.**

1. Desktop HTML contains **no `<meta name="viewport">` whatsoever**.
2. Desktop CSS bundles contain **zero `@media` queries** — none.
3. Layout is pinned: **`min-width: 1188px; width: 1188px`**.
4. The *same URL* with an iPhone UA returns **240 KB of completely different HTML** with a
   different script set and its own viewport meta.
5. The fork is **server-side UA sniffing** — `Vary: User-Agent` plus a `window.UAFromHeader`
   global. `m.daraz.com.bd` resolves to the same IP with **no redirect**.

So: **three separate frontends** — fixed-width desktop, a distinct m-site, and native apps.
No shared responsive layer.

**App-push is relentless:** a pinned top smart banner (`750×150`), a `callapp` deep-link
bridge, **plus A/B flags for a download *popup*** on top of it. And
`user-scalable=no, maximum-scale=1` blocks pinch-zoom.

### 2.8 UI/UX — and how they keep density readable

| Role | Hex |
|---|---|
| **Brand orange** | **`#f85606`** |
| SRP/action orange | `#f57224` |
| Orange drift | `#f36d00`, `#f36f36`, `#f36e36`, `#f57123`, `#ff933f`, `#ff330c`, `#f40`, `#f50` |
| Link teal | `#1a9cb7` |
| Price/urgency red | `#fe4960`, `#ee4054`, `#d2232a` |
| Orange tint surfaces | `#fdeee5`, `#fff1e8`, `#ffe1d2` |
| Text ramp | `#212121` → `#404040` → `#757575` → `#9e9e9e` |

**Nine near-duplicate oranges with no single token** — what a decade of independent teams
shipping into a combo-CDN looks like.

`border-radius: 3px` dominates — near-square corners as a deliberate density signal:
sharp corners read "utility", not "boutique". Search input 45px tall. **40 items per page**
with a **2-line title clamp** for uniform card height without JS measurement.

**The five devices that keep ~40 cards + a 12-facet rail readable — worth studying:**

1. **Fixed slots, not flow.** Badges occupy numbered slots with pre-composed images, so the
   badge row can never wrap or shift.
2. **Hard clamping.** Two-line titles always → every card the same height → the grid reads
   as a table.
3. **One accent does all the work.** Orange means "act/save"; everything else is greyscale,
   so the eye tracks a single signal down the page.
4. **Tint blocks instead of borders.** Promo zones use `#fdeee5` fills rather than outlines —
   grouping without adding lines.
5. **Metadata demoted to 10px grey.** Sold-count, location and seller are present but
   visually silent until looked for.

### 2.9 Weaknesses

- **Header/footer chrome alone costs ~123 KB gzipped of JS** before any content. The search
  bundle is **870 KB raw / 250 KB gzipped** on top of React.
- **Three React runtimes** → near-zero framework cache reuse across pages.
- **Live production breakage:** `helpcenter.daraz.com.bd` **redirects to a Taobao error
  page**; `blog.daraz.com.bd/*` returns **HTTP 500**; **mojibake in live product data**
  (`XL Chest - 40 ", Length â€“ 30""`) served into `<meta name="description">`; a facet
  labelled *"Phone Docks & Stands"* points at `wireless-speakers`.
- **Dead code:** `.lzd-menu-redmart-*` CSS (RedMart is Lazada **Singapore** grocery) ships
  to Bangladesh; **IE 6–9 gradient filters** still in 2026 production CSS; Chinese-language
  debug comments in production JS.
- **Accessibility is the weakest area:** **`<html>` has no `lang` attribute** on a bilingual
  site; no Bengali webfont; pinch-zoom blocked; 10px type pervasive; **badges are images**,
  so one `alt` must encode three concepts; no skip-links; and no `prefers-reduced-motion` or
  `prefers-color-scheme` (unsurprising with zero media queries).
- **Dark patterns:** perpetual countdowns that reset each campaign; discounts computed
  against an unverified `originalPrice`; **cashback clawed back from refunds**; one
  non-combinable voucher per customer with residual value forfeited; app-exclusive pricing
  as deliberate web degradation; and result-count inflation (4080 cap vs 38,290 shown).

---

## Part 3 — Shajgoj (shajgoj.com)

Bangladesh's largest beauty vertical, built content-first. Authorised-distributor retail,
**not** a marketplace — `/authenticity` states products are *"directly sourced from the
brands & authorized distributors"* with barcode traceability, and Trade License
**C-142149/2017** is linked in the footer.

### 3.1 The single most important structural fact

**Shajgoj is two entirely separate applications, on two stacks, two hosts, two languages.**

| | `www.shajgoj.com` — magazine | `shop.shajgoj.com` — store |
|---|---|---|
| Stack | **Laravel + Inertia.js + React** | **Next.js 13/14 Pages Router** |
| Evidence | `Vary: X-Inertia`, `<title inertia>`, Vite `/build/assets/app-*.js` | `X-Powered-By: Next.js`, `__NEXT_DATA__` |
| Host | **Cloudflare** | **Bare nginx/1.18.0**, no CDN |
| Language | **Bangla** | **English only** |
| Security headers | 4 present | **None at all** |
| Asset caching | `max-age=315360000` + gzip | `max-age=3600`, **no compression** |

The magazine is the acquisition engine; the store is the conversion engine. **They are
barely joined, and the seams are where most of the weaknesses live.**

### 3.2 Real catalog scale (far larger than advertised)

Verified from `bk.shajgoj.com/api/taxonomies/get-menu-brands`:
**1,339 brands** (they advertise "450"), **22,044 SKUs**, **335 taxonomy nodes** under 12
top-level entries. Largest by SKU: NICKA K (436), L'Oréal (365), Flormar (353), Topface
(330), The Body Shop (329). Breadth goes past beauty into **Undergarments**, **Jewellery**,
Mom & Baby, Men, Combo, Clearance.

### 3.3 Search — the standout feature

A dedicated microservice, **`khoj.shajgoj.com`** ("khoj" = খোঁজ, Bangla for *search*).

- `GET khoj.shajgoj.com/products?s=<query>&facet=true`, **300 ms debounce**.
- Response is **Algolia-shaped** (`categories.lvl0`/`lvl2` hierarchical facets) but reports
  **`numFound`** — Solr terminology. *Inferred:* Solr behind an Algolia-compatible adapter,
  consumed by Algolia InstantSearch React widgets (`ais-*` classes throughout the CSS).
- **Per-product AI-generated synonym field `search_suggestions_exact`** — a lipstick combo
  carries *"combo pack of matte lipsticks"*, *"mocha nude matte lipstick"*, *"pink matte
  lipstick set"*. This is what makes natural-language queries work.
- **Concern-based query suggestions with counts** — for `lipstick`:
  *"lipstick for dry lips" (9)*, *"long lasting matte lipstick" (7)*, *"highly pigmented
  lipstick" (6)*. These are **problem-shaped, not prefix-shaped**.
- **Rotating search placeholders** from a CMS field (`/api/settings/placeholder_texts`),
  currently *"Ordinary Niacinamide @1099tk, AXIS-Y Dark Spot Serum @1249tk, Dettol upto
  25% off"* — merchandising inside the search box.
- **But search has no URL route** — overlay only. Zero search-landing SEO.
- Slow: `processingTimeMS: 643`, **1.53 s** wall clock for a one-word query.

### 3.4 Product page

Server-rendered via `getServerSideProps`. Gallery is `react-image-gallery` (9 images).

**A genuinely deep pricing engine** — every SKU carries `price`, `sale_price`, `nca_price`,
`temp_price` (each with independent start/end dates), `has_flash_sale`, `price_range`,
`group_price`, and **`app_price_enabled` — app-exclusive pricing surfaced on web** as an
"App Price" label plus an install CTA.

**Available Offers block** renders the *rules*, not just the badge: *"Minimum cart value
TK"*, *"Required brands:"*, *"Required categories:"*, *"Offer Expiry Date:"*, *"View
Applicable Products"*. Most sites hide offer conditions until the cart.

**Content tabs:** Brief Description → Available Offers → Description → **Ingredients (full
INCI list)** → How To Use → **FAQ** → Reviews → **Q&A** → Add Review. The FAQ and Q&A are
**merchant-authored per product** with specific answers.

Four recommendation rails (`SIMILAR PRODUCTS`, `CUSTOMERS ALSO VIEWED`, `RECENTLY VIEWED`,
`RECOMMENDED FOR YOU`) backed by `alternative_products` + a separate ML service at
`recommend.shajgoj.com/recommendation`.

**⚠ The catalog contradicts the code.** Product types `simple | variable | composite |
combo` are supported and a `.size-selector` swatch component exists — but sampling
`foundation` (638), `eyeshadow palette` (515), `concealer` (471) returned **100% `simple`**.
**Every shade is a separate product with its own PDP**, which is why there are 912
"lipsticks". Shoppers get no swatch switching and ratings fragment across shades.

### 3.5 Checkout, loyalty, and the differentiated features

**Payments:** `Cash on delivery` · `Bkash` · `Pay with Card/Mobile Wallet`. Redirect PSP
flow at `/make-payment/[orderId]` with `/success`, `/fail`, `/cancel` — the classic
SSLCommerz/aggregator pattern (*gateway identity inferred, not verified*).

**Shipping:** Inside Dhaka **৳79** (1–2 days) · Outside Dhaka **৳119** (3–5 days) · Free
Shipping. Discounts stack as **Coupon Code + Referral Coupon + Routine Discount**.

**Loyalty:** earn **1 point per ৳100** (1% back), redeem **1 point = ৳1** via e-voucher.
No expiry, no tiers, **and it earns in physical showrooms** (credited in 24 hours vs 21 days
online).

**Referral:** "Refer & Win" with a personal link on a **fourth Next.js app** —
`ft.shajgoj.com/r/<coupon>`.

**Routine Builder** — `/routines`, `/routine-builder/[routineId]`, with a **"Routine
Discount"** line item at checkout. Build a skincare regimen, get a bundle discount. The most
natural AOV mechanic in the category, and the most differentiated thing on the site.

**Concern-based taxonomy as a first-class nav axis** — acne-treatment, pigmentation,
tan-removal, hairfall-thinning, sun-protection, oil-control, anti-ageing. Exposed in the
mega menu, as homepage tiles ("SHOP BY CONCERN"), and as search facets. **People shop
beauty by problem, not by product category.**

### 3.6 Frontend stack

| Layer | Finding |
|---|---|
| Framework | Next.js Pages Router, **`getServerSideProps` on every page** |
| CSS | **Tailwind** with custom `sg-*` tokens, default breakpoints |
| Search UI | Algolia InstantSearch React + **Rheostat** price slider |
| Gallery / carousel | `react-image-gallery` / `slick-carousel` |
| Toasts / skeletons | `react-toastify` / `react-loading-skeleton` |
| State / auth | **Redux** / **NextAuth.js** |
| Firebase | project `shajgojnext`, with **`@firebase/vertexai-preview`** bundled |

**Server- vs client-rendered (measured, scripts stripped) — this is the costly finding:**

| Page | Visible text in HTML |
|---|---|
| Homepage | **873 chars** — chrome + headings only |
| `/product-category/lipstick` (**912 products**) | **734 chars — zero products** |
| PDP | 3,561 chars — fully server-rendered |

Analytics: GA4 `G-DEMJS2E25S`, Facebook Pixel with **server-generated `fb_event_id`** passed
from `getServerSideProps` for CAPI deduplication (correctly implemented — most teams get
this wrong), TikTok Pixel.

### 3.7 Backend / infrastructure

**Seven hosts.** The revenue-generating storefront and its API are **the only things not
behind a CDN or WAF** — origin IPs directly exposed on a contiguous /24, while the *blog*
enjoys full Cloudflare.

| Host | Role | Fronting |
|---|---|---|
| `shop.shajgoj.com` | Next.js storefront | **none — bare nginx** |
| `bk.shajgoj.com` | Laravel API + CMS + media | none, **LiteSpeed** |
| `khoj.shajgoj.com` | Search (DigitalOcean) | none |
| `www.shajgoj.com` | Laravel/Inertia magazine | Cloudflare |
| `recommend.shajgoj.com` | Recommendation ML | Cloudflare |
| `chatapp.shajgoj.com` | Self-hosted live chat | Cloudflare |
| `ft.shajgoj.com` | Referral short links | Cloudflare |

**Exposed unauthenticated endpoints** (all return data with no key): `/api/menu/get-menu`
(49 KB), `/api/taxonomies/get-menu-brands` (86 KB), `/api/available_offers` (18 KB),
`/api/get-reviews/<id>`, `/api/get-question/<id>`, the whole `khoj` search API, and
`POST recommend.shajgoj.com/recommendation`. `access-control-allow-origin: *` with only a
360 req/min Laravel throttle.

**⚠ Competitive-intelligence leak:** the public search index returns **`daily_sales`,
`weekly_sales`, `monthly_sales`** per product (sample lipstick: 3 / 20 / 81), plus `stock`
and `rank`. **Anyone can scrape unit velocity and inventory for all 22,000 SKUs.**

**⚠ Leaked internal error:** `khoj.shajgoj.com/products?s=` returns HTTP 500 with the raw
body `"ERROR: Something Went Wrong. Check Log Messages."`

**Storefront security headers — there are none:** no HSTS, CSP, X-Frame-Options,
X-Content-Type-Options or Referrer-Policy on the pages handling addresses and payment
redirects. `Server: nginx/1.18.0 (Ubuntu)` (a 2020 release) and `X-Powered-By` both
disclose versions. The blog has four of these headers; **the checkout has zero.**

### 3.8 Responsiveness

One responsive codebase, but with **separate mobile routes** (`/mobile-category`,
`/mobile-brand`) and — the good part — **separate desktop and mobile creative in the CMS**
(`slider` vs `mobile_slider`, `banner` vs `app_banner`, `page_design` vs
`mobile_page_design`).

Tailwind defaults 640/768/1024/1280/1536 plus bespoke `max-width` queries at 1279/1023/768/
767/500/480. Mixing `min-width:768` and `max-width:768` (both inclusive) is a **latent
double-application bug at exactly 768px**.

Container padding *shrinks* going from 640 (`2rem`) to 768 (`1rem`) — an inconsistency —
then jumps to `11rem` gutters at 1536.

**Thoughtful:** floating UI reflows around the mobile tab bar — chat moves from
bottom-right (60×60) to **bottom-left** (50×50), back-to-top tightens. And
`@media (hover:hover) and (pointer:fine)` gates hover effects to real pointers.

**Weak:** the product grid collapses to **one column** on mobile (competitors use two),
doubling scroll depth on a 900-SKU category. OTP inputs are 50×40 px (**below the 44px
minimum in height**), and gallery bullets shrink to `padding:2.7px`.

**⚠ `maximum-scale=1` disables pinch-zoom** — a WCAG 1.4.4 failure. (The magazine does
*not* have this bug.)

### 3.9 UI/UX design system

| Token | Hex | Role |
|---|---|---|
| `sg-pink` | **`#FF3D71`** | primary — CTAs, prices, active states |
| `sg-black` | **`#192038`** | text/dark surfaces (a **navy**, not black) |
| `sg-darkpurple` | **`#5C0F8B`** | secondary accent, eyebrows |
| `sg-quartz` | **`#49454F`** | muted body text |
| `sg-gray` | **`#F5F5F5`** | page/section background |

**Off-system colours that shouldn't be there:** `#337ab7` — **Bootstrap blue, 11
occurrences, used for the *active gallery thumbnail border*** — so the selected image is
outlined in blue on a pink-branded site, because `react-image-gallery`'s default stylesheet
was never themed. Plus token drift across three near-identical pinks (`#FF3D71`, `#FF2D55`,
`#FE3D71`).

**Typography — the most directly actionable visual finding.** Montserrat, but the scale is
**Tailwind default truncated at `text-3xl`**:

`text-xs 12px · text-sm 14px · text-base 16px · text-lg 18px · text-xl 20px · text-2xl 24px
· text-3xl 30px`

**There is no display tier.** The largest type anywhere on the site is 30px — which is
precisely why it reads flat and catalogue-like rather than premium.

**And Montserrat is declared but never loaded on the storefront** — no `@font-face`, no
Google Fonts link — so the store silently falls back to system sans while the blog renders
in Montserrat. The two properties don't even look like the same brand.

**Price display (verbatim CSS):**
```css
.just-price{font-size:1.25rem;font-weight:600;color:rgb(255 61 113)}
.cut-price {font-size:1rem;color:rgb(156 163 175);text-decoration:line-through;
            border-right-width:2px;padding-right:.75rem}
```
Rendered as `৳ 325.00 | ৳ 450.00  Save ৳ 125.00  28 % OFF` — **four ways of saying the same
discount**. Effective for a price-sensitive market.

**Shape/elevation are unsystematic:** **18 distinct border-radius values** in one
stylesheet, with both `50%`/`100%` and `9999px`/`100px` expressing "fully round" three
different ways; ~8 ad-hoc shadows with no scale.

**Validation bug:** `.error-message` is bordered `#C3E6CB` — **Bootstrap's *success*
green**. Error states render in green.

**Heading structure on the PDP:** `h4, h4, h2, h4, h4, h2, h4, h6, h6, h2, …` — **no `<h1>`
at all**, and h6 appears before h5.

### 3.10 Weaknesses

**Performance**
- **Static assets are served completely uncompressed.** `_app-*.js` returns
  `Content-Length: 411398` with **no `Content-Encoding`**; CSS is 100,937 bytes raw. The
  HTML *is* gzipped, so this is an nginx `gzip_types` misconfiguration omitting
  `application/javascript` and `text/css`. **Enabling gzip alone would cut ~500 KB from
  every cold load.**
- **Content-hashed immutable assets get `max-age=3600`** — repeat visitors re-download the
  entire bundle hourly. (The magazine correctly uses `max-age=315360000`.)
- **No CDN on the storefront**, while the blog has full Cloudflare.
- **Images unoptimised** — raw JPEG even when the request sends `Accept: image/avif,
  image/webp`. No WebP/AVIF, no `srcset`, **`next/image` is not used at all**. PDPs ship
  nine full-size JPEGs.

**SEO — the most costly category**
- **No `robots.txt` and no `sitemap.xml` on the storefront** — both **404**. For 22,044 SKUs.
- **Category pages render zero products server-side** — `/product-category/lipstick` (912
  products) emits 734 characters and **no internal links to any PDP**.
- **The magazine's sitemap is 98.5% broken.** It lists 5,996 URLs, of which **5,908 are
  `/post/<slug>` — and every one returns 404.** The live articles are served from the
  **root** path. Their entire 5,900-article content moat — the thing driving all organic
  acquisition — is advertised to Google at addresses that don't exist. Almost certainly
  fallout from a WordPress→Laravel replatform.
- **No `<h1>` and no canonical on PDPs.** JSON-LD contains **only `BreadcrumbList`** — there
  is **no `Product` schema**, so no price/availability/rating rich results anywhere.

**Content quality**
- **Cross-shade image contamination:** the "Hot Nude - 222" PDP gallery contains **five
  images filenamed `…red-wine-224-…`**. Shoppers are shown the wrong shade — the single most
  damaging possible error for colour cosmetics.
- **Product descriptions carry pasted foreign markup** — 13 occurrences of
  `shopify-section` and `template--24059335409979__product_description_v2_NNBGCQ` in one
  description field, copied wholesale from a brand's Shopify site.
- **App-only deep link leaks into the web menu** — `CLEARANCE SALE APP` with
  `href="shajgoj://anything/?tags=clearance"`, dead in every browser.
- **Three coexisting listing URL grammars** plus migration scars in slugs (`face-1`,
  `anti-ageing-1`, `shop-by-concern-1-skin`) — splits link equity.
- Missing: no Buy Now, no newsletter, no WhatsApp/Messenger, no order-tracking page, no
  language toggle on the store, and a **3-day return window**.

---

# Part 4 — Synthesis: what GulfRabit should do

## 4.1 The pattern across all three

Each site is strong in exactly one dimension and weak in the others:

| | Ghorer Bazar | Daraz | Shajgoj |
|---|---|---|---|
| **Strength** | Trust mechanics + channel coverage | Data contracts + scale engineering | Search + CMS + content moat |
| **Commerce logic** | Excellent | Excellent | Very good |
| **Delivery layer** | Poor (1.76 MB, 640 KB PNGs) | Poor (3 Reacts, no responsive) | Poor (uncompressed, no CDN) |
| **Accessibility** | Bad (108 unlabelled buttons) | Bad (no `lang`, no Bengali font) | Bad (no `<h1>`, zoom blocked) |
| **Bangla typography** | **No webfont** | **No Bengali subset at all** | Bangla only on the blog |

**Three market leaders, and not one of them loads a Bengali webfont.** All three block or
degrade pinch-zoom. All three have broken or missing sitemaps somewhere. **None has a
Content-Security-Policy.**

This is the opening. GulfRabit cannot out-scale Daraz or out-spend Ghorer Bazar's Facebook
machine — but it can be **the only one that is fast, accessible, and typographically correct
in both scripts.** That is a real, defensible, and cheap differentiator.

## 4.2 Adopt — ranked by value per unit of effort

1. **The pre-filled WhatsApp/Messenger order deep link on every PDP** (Ghorer Bazar). Carry
   product name, price, SKU and URL into the message body. In Bangladesh, trust lives in
   chat; for a first-time buyer of a ৳2,500 item, talking to a human before paying is the
   conversion unlock. Near-zero engineering cost.
2. **Minimal checkout: name, phone, address, district — email explicitly `(Optional)`,
   guest by default, phone-OTP as the primary auth** (Ghorer Bazar + Shajgoj). **The phone
   number, not the email, is the identity primitive in this market.**
3. **Flat delivery pricing stated in plain words** — "৳70 inside Dhaka, ৳130 outside, for
   any amount of products". No weight tiers, no arithmetic, no anxiety. Treat Chattogram as
   a metro tier alongside Dhaka, as Ghorer Bazar does.
4. **Per-tender refund matrix as published policy** (Daraz): "bKash: 5 working days,
   COD → bank deposit: 5 working days". A concrete trust artefact that costs nothing.
5. **The image CDN convention** (Daraz): `{hash}.jpg_{W}x{H}q{Q}.jpg_.avif` with AVIF/WebP/
   JPG triples per size, selected via `<picture>`. Declarative, stackable, cacheable.
   → *GulfRabit already generates its own imagery, so this is a generator change, not infra.*
6. **The widget-based homepage/category CMS** (Shajgoj): every section a row of
   `{widget_name, content, order, is_active}`, with **separate desktop and mobile creative**
   (`slider` vs `mobile_slider`). Merchandisers reorder without a deploy.
7. **Per-product AI-generated search synonyms + concern-based query suggestions**
   (Shajgoj). Cheap to generate offline with an LLM over a 44-product catalog, and it turns
   a keyword index into something that answers real questions.
8. **The `ppath` facet encoding + category-schema-driven facets** (Daraz): one URL param
   carrying `propertyId:valueId` pairs, with facets generated from each category's attribute
   schema. GulfRabit's industrial SKUs already carry `specs` — this is the natural filter
   model, and it scales without new filter pages.
9. **Fixed badge slots** (Daraz). Reserve N positions with deterministic priority so the
   badge row can never wrap or shift. GulfRabit already has PREMIUM/NEW/SALE badges stacking
   — give them slots.
10. **Offer *rules* rendered on the PDP** (Shajgoj): "Minimum cart value ৳X", "Required
    brands:", "View Applicable Products". Don't hide qualification until the cart.
11. **Gift-with-purchase threshold with live progress** (Ghorer Bazar): "Add ৳3,000 more to
    unlock". At GulfRabit's basket sizes a physical product beats waived shipping, and it
    costs COGS rather than margin while seeding trial of another SKU.
12. **Partial-payment plans with an explicit discount** (Ghorer Bazar): 50%/75%/full
    advance, each with a "Payment Plan Discount" line. COD return-fraud is the structural
    margin leak in BD e-commerce; this **pays customers to de-risk the order** instead of
    forcing prepayment and killing conversion.
13. **Merchant-authored FAQ + Q&A per product** (Shajgoj). Works from day one with zero
    customers — unlike reviews.
14. **Barcode + country-of-origin merchandised as trust** (Shajgoj). GulfRabit's entire
    pitch is "Sourced. Verified. Delivered." — publishing provenance data *is* the product.
15. **Loyalty that earns offline too** (Shajgoj) and **server-generated `fb_event_id`** for
    CAPI deduplication (Shajgoj) if paid social is ever switched on.

## 4.3 Explicitly reject

- **Daraz's gamification** — coins, match-3 games, shake-to-win, mystery boxes. Engagement
  farming for a commodity marketplace; on a premium storefront it signals "cheap".
- **Perpetual countdown timers and "N sold" everywhere.** One credible scarcity signal
  beats fifteen.
- **Nine competing oranges** (Daraz) / **18 border-radius values** (Shajgoj) / **ten radius
  values with squared buttons beside rounded cards** (Ghorer Bazar). GulfRabit's "exactly
  two radii, three shadows" rule is already better than all three — keep it.
- **Fixed-width desktop + a forked m-site** (Daraz). Three frontends is an organisational
  compromise for hundreds of teams.
- **`user-scalable=no` / `maximum-scale=1`.** All three do it. Never.
- **Keyword-stuffed product titles** (Daraz). A premium brand's product names are its voice.
- **384 SEO link tags in the footer** (Daraz).
- **The 10px grey metadata floor** (Daraz). Below ~12px you have excluded part of your
  audience.
- **Cashback clawed back from refunds**, unverified `originalPrice` anchors, and result-count
  inflation (Daraz). Dark patterns that cost trust — the one thing GulfRabit is selling.

## 4.4 The specific gaps GulfRabit must not repeat

Checked against the current build:

| Their failure | GulfRabit status |
|---|---|
| No Bengali webfont (all three) | ⚠ **Open** — `--font-body` lists `Noto Kufi Arabic` but **no Bengali family**. Multi-language is listed as "not wired". |
| Pinch-zoom blocked (all three) | ✅ Not present — verify it stays that way |
| No CSP (all three) | ⚠ Open — static host, but worth adding |
| No `<h1>` on PDP (Shajgoj, Ghorer Bazar homepage) | ✅ Headings are semantic |
| No `Product` JSON-LD (Shajgoj) | ✅ Already on the PDP |
| Category pages render zero products server-side (Shajgoj) | ✅ Content-first HTML is the whole architecture — **this is GulfRabit's biggest structural advantage over Shajgoj** |
| Uncompressed JS/CSS, no CDN (Shajgoj) | ✅ Static site; add compression at the host |
| Images with no `srcset`/WebP/AVIF (Ghorer Bazar, Shajgoj) | ⚠ **Open** — SVG placeholders sidestep it today, but real photography must ship `srcset` + AVIF from day one |
| Sitemap broken/missing (Shajgoj, Ghorer Bazar) | ✅ Generated, 64 URLs |
| Error states styled green (Shajgoj) | ✅ `--gr-error` is correct |
| Brand colour fails contrast on white (Ghorer Bazar headings at 2.4:1) | ✅ **Fixed 2026-07-25** — `--link`/`--lime-ink`/`--gold-ink` all ≥4.8:1 |

**The single highest-value differentiator available:** ship a proper **Bengali webfont**
(Noto Sans Bengali or Hind Siliguri) with a correct `unicode-range` for U+0980–09FF, and a
real Bangla/English toggle. Daraz ships **Greek and Cyrillic** webfonts to Dhaka and no
Bengali; Ghorer Bazar runs an English store for a Bangla-acquired audience; Shajgoj keeps
Bangla on the blog and English in the shop. **Getting Bengali typography right on its own
would visibly outclass all three market leaders.**

