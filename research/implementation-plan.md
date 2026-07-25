# GulfRabit — Implementation Plan from Competitor Research

> Source: [`competitor-analysis.md`](competitor-analysis.md) — live teardowns of Shajgoj,
> Ghorer Bazar and Daraz Bangladesh.
>
> This document turns those findings into **things to build**, mapped onto GulfRabit's
> actual files. Every item states: what it is, who does it, why it works in Bangladesh,
> **where it goes in this repo**, what data model change it needs, and rough effort.
>
> Effort key: **S** = under an hour · **M** = a few hours · **L** = a day or more.

---

## Tier 0 — Do these first (highest value per hour)

### 0.1 Pre-filled WhatsApp / Messenger order link on every PDP
**Who:** Ghorer Bazar. **Why:** in Bangladesh trust lives in chat. For a first-time buyer of
a ৳2,500 imported item, being able to talk to a human before paying is the conversion
unlock. Ghorer Bazar treats the website as *one of five order channels*, and this is the
bridge between them.

Their exact deep link carries the whole context so the agent never has to ask "which one?":
```
https://wa.me/8801XXXXXXXXX?text=Hello! GulfRabit, I'm interested in:
Product: Medjool Dates — Premium Jumbo (1kg)
Price: 1450
SKU: gr-1001
Product URL: https://.../modules/catalog/product.html?id=gr-1001
```

**Build here:** [modules/catalog/product-page.js](../modules/catalog/product-page.js) —
render two secondary CTAs under Add to Cart. Style with the existing `.btn-outline-gr`.
Use `siteURL()` from [shared/js/core/paths.js](../shared/js/core/paths.js) to build an
absolute product URL. Put the phone number in one constant so it is changed in one place.

**Data:** none — everything needed is already on the product object.
**Effort: S.** This is the single best return in the whole document.

---

### 0.2 Cut the checkout to the fields Bangladesh actually needs
**Who:** Ghorer Bazar and Shajgoj both. **Why:** **the phone number, not the email, is the
identity primitive in this market.** Ghorer Bazar requires exactly five things — name,
phone, address, district, terms — and labels email `(Optional)`. Guest checkout is the
default; login is an unobtrusive link.

**Build here:** [modules/checkout/_fragments/checkout.main.html](../modules/checkout/_fragments/checkout.main.html)
then re-run `python tools/assemble.py`. Audit every field: anything not in that list of
five becomes optional or is removed. Mark email literally `Email (optional)` in the
placeholder, as they do.

Also add the **district → thana** dependent selects (64 districts) — Ghorer Bazar drives
delivery pricing off district, which is the next item.

**Data:** add `data/districts.json` (64 districts, each with thanas).
**Effort: M.**

---

### 0.3 Zone-based delivery pricing, stated in plain words
**Who:** Ghorer Bazar, verified live: **৳70** inside Dhaka **and Chattogram** (72 hours),
**৳130** everywhere else (4 working days), **flat regardless of order value**. Shajgoj:
৳79 inside Dhaka, ৳119 outside.

**Why:** no weight tiers, no thresholds, no arithmetic — it removes the biggest source of
checkout anxiety. Treating Chattogram as a metro tier alongside Dhaka is a smart move
almost nobody copies. Note Ghorer Bazar puts Gazipur and Narayanganj — both Dhaka-adjacent
— on the ৳130 outside rate, so the zoning is commercial, not geographic.

**Build here:** [modules/checkout/backend/api.js](../modules/checkout/backend/api.js) —
a `getShippingQuote(districtId)` returning `{ cost, etaText, zone }`. Surface the ETA text
next to the cost; Ghorer Bazar's "72 Hours" / "4 working days" phrasing is clearer than a
date. Document it in
[modules/checkout/backend/endpoints.md](../modules/checkout/backend/endpoints.md) — the
`POST /checkout/shipping-quote` contract already exists there.

**Careful:** GulfRabit's announcement bar currently promises *"Free delivery in Dhaka on
orders over ৳3,000"*. That is a **threshold** model, which contradicts the flat model. Pick
one and make the whole site say the same thing — see 1.4 for the better version.
**Effort: M.**

---

### 0.4 Publish a per-tender refund matrix
**Who:** Daraz — the best-documented policy area found anywhere in this research.
Card 10 working days · Rocket 7 · DBBL Nexus 7 · bKash 5 · Nagad 5 · **COD → bank deposit,
5 days** · Voucher → 1 day.

**Why:** after the Evaly-era collapses, "when do I actually get my money back" is the
question behind every hesitation. A concrete table costs nothing and buys real trust.

**Build here:** [modules/content/_fragments/shipping.main.html](../modules/content/_fragments/shipping.main.html)
— add a refund-timeline table, and link it from the PDP trust row and the checkout payment
step.
**Effort: S.**

---

## Tier 1 — Conversion mechanics

### 1.1 Gift-with-purchase threshold with live progress
**Who:** Ghorer Bazar, shown live inside the cart drawer with a gift icon:
*"Get 500ml Mustard Oil — Add ৳3,000 more to unlock!"*

**Why:** at GulfRabit's basket sizes a **physical product beats waived shipping** — it costs
COGS rather than margin, and it seeds trial of another SKU. The progress framing ("add ৳X
more") is the mechanic that actually moves basket size.

**Build here:** [shared/js/components/cart-drawer.js](../shared/js/components/cart-drawer.js)
and [modules/cart/cart-page.js](../modules/cart/cart-page.js). Subscribe to the existing
cart state in [shared/js/core/state.js](../shared/js/core/state.js) and render a progress
bar plus the reward line. Add a `.promo-progress` block to
[shared/css/partials/_cards.css](../shared/css/partials/_cards.css).

**Data:** a `data/promotions.json` with `{ threshold, rewardProductId, label }`.
**Effort: M.**

### 1.2 Frequently-bought-together with live savings math
**Who:** Ghorer Bazar. First item is `checked disabled` as the anchor, the others are
pre-checked and removable, with a running total and "Save ৳N", then "Add 3 items to cart".

**Why:** raises AOV with near-zero friction, and the pre-checked default does the work.

**Build here:** [modules/catalog/product-page.js](../modules/catalog/product-page.js), below
the buy box. Reuse `getRelated()` from
[shared/js/core/data-service.js](../shared/js/core/data-service.js) for the candidate set.
**Effort: M.**

### 1.3 Render offer *rules* on the PDP, not just a badge
**Who:** Shajgoj. Their Available Offers block shows *"Minimum cart value TK"*,
*"Required brands:"*, *"Required categories:"*, *"Offer Expiry Date:"*, *"View Applicable
Products"*.

**Why:** most sites hide qualification until the cart, which produces the "why didn't my
discount apply" support ticket. Showing the rule up front converts better and deflects
support.

**Build here:** a new `shared/js/components/offer-block.js` consuming `data/promotions.json`,
rendered on the PDP and the cart.
**Effort: M.**

### 1.4 Decide the delivery promise and make it consistent
Three models are in play across the references: Ghorer Bazar's **flat, no threshold**;
Shajgoj's **flat with a free-shipping tier**; Daraz's **per-seller computed**.

**Recommendation:** flat ৳70 metro / ৳130 outside, **plus** the gift threshold at ৳3,000
from 1.1 — so the announcement bar changes from *"Free delivery over ৳3,000"* to a gift
reward, and delivery pricing stays flat and predictable. That combination is strictly
better than either reference and resolves the contradiction noted in 0.3.

**Build here:** [shared/components/header.html](../shared/components/header.html)
announcement bar, then re-run the assembler.
**Effort: S.**

### 1.5 Partial-payment plans with an explicit discount
**Who:** Ghorer Bazar — 50% / 75% / full advance, each with a *"Payment Plan Discount"* line
item.

**Why:** COD return-fraud is the structural margin leak in Bangladeshi e-commerce — refused
parcels mean paying courier costs both ways. Rather than forcing prepayment and killing
conversion, they **pay the customer to de-risk the order**. Market-specific and rarely
implemented well.

**Build here:** [modules/checkout/checkout-page.js](../modules/checkout/checkout-page.js)
payment step. Keep it UI-only for now, alongside the existing
`// TODO: connect to payment gateway`.
**Effort: M.** *(Defer until a real gateway exists — the mechanic is meaningless mocked.)*

---

## Tier 2 — Search and discovery

### 2.1 Per-product AI-generated search synonyms
**Who:** Shajgoj. Every document in their index carries a `search_suggestions_exact` field —
a lipstick combo holds *"combo pack of matte lipsticks"*, *"mocha nude matte lipstick"*,
*"pink matte lipstick set"*. This is what makes natural-language search work.

**Why:** it is the highest-leverage search upgrade available, and with a 44-product catalog
it is **almost free** — generate the synonyms once, offline, with an LLM, and commit them.

**Build here:** add a `searchTerms: []` array to each product in
[data/products.json](../data/products.json) (a `tools/gen-search-terms.py` can produce
them), then have `searchProducts()` in
[shared/js/core/data-service.js](../shared/js/core/data-service.js) match against it.
**Effort: M.** High impact.

### 2.2 Concern/use-case based query suggestions
**Who:** Shajgoj — for `lipstick` they return *"lipstick for dry lips" (9)*, *"long lasting
matte lipstick" (7)*, with counts. **Problem-shaped, not prefix-shaped.**

**Why:** people shop by problem. GulfRabit's equivalents: *"dates for iftar"*, *"sugar-free
chocolate"*, *"cold-pressed olive oil"*, *"relays for 24V control panels"*.

**Build here:** [shared/js/components/search-autocomplete.js](../shared/js/components/search-autocomplete.js)
— add a suggestions section above the product results.
**Effort: M.**

### 2.3 Rotating merchandised search placeholder
**Who:** Shajgoj, CMS-driven, currently *"Ordinary Niacinamide @1099tk, AXIS-Y Dark Spot
Serum @1249tk, Dettol upto 25% off"*.

**Why:** free, high-visibility promo space inside a component you already have.

**Build here:** the header search input in
[shared/components/header.html](../shared/components/header.html) plus a small rotator in
[shared/js/components/header-nav.js](../shared/js/components/header-nav.js).
**Effort: S.**

### 2.4 Category-schema-driven facets with a generic URL encoding
**Who:** Daraz. Their `ppath` parameter carries `propertyId:valueId` pairs comma-joined —
`30129:3731` = Colour:Black. **One generic URL param handles unlimited category-specific
attributes**, and the facets themselves are generated from each category's attribute schema
(smartphones get RAM/battery/camera; t-shirts get material/colour/fit).

**Why:** GulfRabit's industrial SKUs already carry a `specs` object. This is the natural way
to make those specs filterable **without building a new filter page per category** — which
matters directly for the B2B module.

**Build here:** [shared/js/components/filters-sidebar.js](../shared/js/components/filters-sidebar.js)
— derive facets from the `specs` keys present in the current product set, and encode them
into one query param via
[shared/js/core/router-helpers.js](../shared/js/core/router-helpers.js).
**Effort: L.** Worth it; it is the unlock for B2B filtering.

### 2.5 Give search a real URL
**Who:** nobody — Shajgoj's search is an **overlay with no route**, forfeiting every
long-tail landing page. GulfRabit already has `search-results.html` with `?q=`, so this is
already right. **Keep it that way** and make sure the autocomplete overlay always offers
"see all results for X" pointing at the real URL.
**Effort: S.**

---

## Tier 3 — Trust (this is GulfRabit's actual product)

The brand promise is *"Sourced. Verified. Delivered."* — so provenance data **is** the
product, and it should be merchandised, not buried.

### 3.1 Barcode + country of origin on the PDP
**Who:** Shajgoj, alongside a linked Trade License PDF and a dedicated `/authenticity` page.
**Why:** in a counterfeit-anxious market this does more than any "100% authentic" badge,
because it is checkable.

**Build here:** the spec table in
[modules/catalog/_fragments/product.main.html](../modules/catalog/_fragments/product.main.html).
**Data:** add `barcode` and confirm `origin` on every product in `data/products.json`.
**Effort: S.**

### 3.2 A real authenticity / sourcing page
**Who:** Shajgoj's `/authenticity`. GulfRabit already has an About page and the hero CTA
literally says *"Our Sourcing"* — make sure that CTA lands somewhere that earns it:
importer chain, verification method, what "import-verified" concretely means.
**Build here:** a new `modules/content/_fragments/sourcing.main.html`, registered in
[tools/assemble.py](../tools/assemble.py).
**Effort: M.**

### 3.3 Merchant-authored FAQ and Q&A per product
**Who:** Shajgoj — real, specific answers per product.
**Why:** unlike reviews, this **works from day one with zero customers**. For imported food
the blockers are concrete: shelf life, storage, halal status, packaging integrity.
**Build here:** a new tab in the existing PDP tab set.
**Data:** `faq: [{q, a}]` on the product object.
**Effort: M.**

### 3.4 Named testimonials with occupations
**Who:** Ghorer Bazar — "Ahmod Al Kamran, *Student*", "Sultana Yesmin, *Housewife*", in
Bangla, addressing distrust head-on. GulfRabit's homepage already has a testimonial slider;
add the occupation line and consider Bangla quotes.
**Effort: S.**

---

## Tier 4 — Interface craft

### 4.1 Fixed badge slots
**Who:** Daraz. Badges occupy numbered slots and are served as **pre-composed images**, so
the badge row can never wrap or shift — zero layout shift, deterministic width.

**Why here:** GulfRabit's PLP already stacks PREMIUM + NEW + −19% and the stack grows
downward unpredictably. You do not need their image sprites — just **reserve slots with a
priority order** (discount > premium > new > origin) and cap at two visible.

**Build here:** `.product-card__badges` in
[shared/css/partials/_cards.css](../shared/css/partials/_cards.css) and the badge logic in
[shared/js/components/product-card.js](../shared/js/components/product-card.js).
**Effort: S.**

### 4.2 Four-way discount display
**Who:** Shajgoj: `৳ 325.00 | ৳ 450.00  Save ৳ 125.00  28 % OFF` — sale price, vertical
rule, struck original, **absolute saving**, and percentage. Four ways of saying one thing,
and it works in a price-sensitive market.

GulfRabit currently shows price + struck original + a percentage badge. **Add the absolute
"Save ৳125"** — in BDT the absolute number lands harder than the percentage.
**Build here:** `.product-card__price-row` and the PDP price block.
**Effort: S.**

### 4.3 Separate desktop and mobile creative
**Who:** Shajgoj's CMS stores `slider` vs `mobile_slider` and `banner` vs `app_banner`.
**Why:** hero text legible at 1920×490 is unreadable at 412px. They ship both and pick
server-side.
**Build here:** the hero in [index.html](../index.html) — use `<picture>` with a
`media` query rather than one image scaled down.
**Effort: S.** *(Applies when real photography replaces the SVG placeholders.)*

### 4.4 Floating UI that reflows around mobile chrome
**Who:** Shajgoj — the chat button moves from bottom-right (60×60) to **bottom-left**
(50×50) on mobile so it never collides with the bottom tab bar; back-to-top tightens.
**Why here:** GulfRabit has a floating compare tray plus a sticky cart CTA on the cart page.
Check they never overlap at 375px.
**Build here:** `.compare-tray` in
[shared/css/partials/_utilities.css](../shared/css/partials/_utilities.css) and
`.cart-mobile-cta` in [modules/cart/cart.css](../modules/cart/cart.css).
**Effort: S.**

### 4.5 Keep the density discipline you already have
Daraz keeps ~40 cards readable using five devices worth naming, because they are all things
GulfRabit already does or should:
1. **Fixed slots, not flow** (see 4.1)
2. **Hard clamping** — two-line titles always, so every card is the same height
3. **One accent does the work** — orange means act/save, everything else greyscale
4. **Tint blocks instead of borders** for promo zones — grouping without adding lines
5. Metadata demoted — *but they go to 10px grey, which excludes people. Stop at 12px.*

GulfRabit's "exactly two radii, three shadows, 80/20 colour" rule is **already stricter than
all three sites**. Ghorer Bazar has ten radius values and squared buttons beside rounded
cards; Shajgoj has eighteen; Daraz has nine competing oranges. Do not loosen this.

---

## Tier 5 — The differentiator nobody else has

### 5.1 Ship a Bengali webfont
**None of the three market leaders loads one.**
- **Daraz** self-hosts Roboto with **cyrillic, cyrillic-ext, greek, greek-ext, vietnamese,
  latin and latin-ext subsets — and no Bengali at all**, with zero `unicode-range` covering
  U+0980–09FF, while Bangla is their *mobile default language*.
- **Ghorer Bazar** loads only Open Sans; its Bangla testimonials fall back to whatever the
  device has.
- **Shajgoj** keeps Bangla on the blog and runs the store in English, and the store does not
  even load the Montserrat it declares.

**So: Greek and Cyrillic get shipped to Dhaka, and Bengali does not.**

**Build here:** [shared/css/partials/_variables.css](../shared/css/partials/_variables.css) —
add **Noto Sans Bengali** or **Hind Siliguri** to `--font-body` with a correct
`unicode-range: U+0980-09FF` `@font-face`, self-hosted in `assets/fonts/`.
context.md §8 currently lists multi-language as "font stack ready; not wired" — the stack
names `Noto Kufi Arabic` but **no Bengali family**, so it is not actually ready.

**Effort: M.** Getting Bengali typography right on its own would visibly outclass all three
market leaders, and it costs a font file and a media query.

### 5.2 Do not repeat their accessibility failures
All three fail the same way. GulfRabit is currently clean on most of these — the value here
is **not regressing**:

| Failure | Who | GulfRabit |
|---|---|---|
| `maximum-scale=1` blocks pinch-zoom (WCAG 1.4.4) | **all three** | ✅ clean — keep it |
| No `<h1>` on key pages | Shajgoj PDP, Ghorer Bazar home | ✅ semantic headings |
| Icon buttons with no accessible name | Ghorer Bazar — **108 of 164** | ✅ ARIA labelled |
| Brand colour fails contrast as text | Ghorer Bazar headings at 2.4:1 | ✅ fixed 2026-07-25 |
| No `<html lang>` on a bilingual site | Daraz | ⚠ set `lang` per language when Bangla ships |
| No `prefers-reduced-motion` | Daraz | ✅ already honoured |
| Error states styled green | Shajgoj | ✅ `--gr-error` correct |

### 5.3 Beat them on delivery, cheaply
Their engineering weaknesses are all easy wins for a static site:

| Their problem | GulfRabit |
|---|---|
| 1.76 MB uncompressed CSS+JS; two icon fonts (Ghorer Bazar) | Small hand-written CSS; **remove the Tailwind Play CDN before production** (context.md §8 already flags this) |
| 111 images, zero `srcset`, one `width`/`height` pair (Ghorer Bazar) | ⚠ **Open** — real photography must ship `srcset` + AVIF and explicit dimensions from day one |
| Uncompressed JS/CSS, no CDN, `max-age=3600` on hashed assets (Shajgoj) | Static host — enable Brotli and long `max-age` |
| Category pages render **zero products** server-side (Shajgoj) | ✅ **Content-first HTML is the whole architecture — this is the single biggest structural advantage over Shajgoj** |
| Sitemap 98.5% broken / missing entirely | ✅ generated, 64 URLs |
| No `Product` JSON-LD (Shajgoj) | ✅ already on the PDP |
| No CSP anywhere | ⚠ add headers at the host |

---

## Suggested order of work

1. **0.1 WhatsApp order link** — an hour, biggest single return
2. **0.4 refund matrix** + **1.4 delivery promise** + **3.1 barcode/origin** — a morning of trust wins
3. **0.2 / 0.3 checkout + district-based delivery** — the real conversion surface
4. **1.1 gift threshold** and **4.2 absolute savings** — basket size
5. **2.1 search synonyms** — cheap at 44 products, and it compounds as the catalog grows
6. **5.1 Bengali webfont** — the differentiator
7. **2.4 schema-driven facets** — the B2B unlock, and the largest single piece

Items **1.5** (partial payment) and **4.3** (responsive creative) are blocked on a real
payment gateway and real photography respectively — leave them until those land.
