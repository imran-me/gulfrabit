# modules/hero

The banners at the top of the home page: what they show, where they send you,
and how they move. Managed from **Admin → Catalogue → Hero banners**.

Delete this folder, its line in `bootstrap/providers.php`, its PSR-4 entry in
`composer.json` and its two entries in `tools/assemble.py`, and the home page
falls back to the banners authored into `index.html`. The shop carries on.

## The fallback is real, not a courtesy

`index.html` still contains four hand-written slides, and they are what a
visitor sees first — before any JavaScript runs, which is why the largest image
on the home page never waits for a request. Then `home.js` asks `/api/hero`:

| What comes back | What the page does |
|---|---|
| Live banners | replaces the authored set **as a group** |
| No live banners | keeps the authored set |
| 404, network failure, missing table | keeps the authored set |

Replacing as a group matters: a merchant should never be looking at a mix of
what they chose and what shipped with the site. It is also why the panel says,
at the top, that switching on the first banner takes over completely.

## Why the link is stored as two columns

`link_type` + `link_value` — `('product', 'gr-1101')` — never a finished URL.
The href is built in `HeroSlide::href()` at read time.

This paid for itself within a day. Products moved from
`modules/catalog/product.html?id=gr-1101` to `/product/gr-1101` while this
module was being written, and the change was **one line in one file**. Had the
finished href been stored, every banner in the database would have needed a
migration, and any that were missed would have 404'd silently.

`custom` is the escape hatch, and it is validated to a **same-site path**. Not
a preference: the hero is the most-clicked thing on the shop, and an admin
account that can aim it at any host is an admin account that can phish the
shop's own customers from the shop's own front page. Both `//evil.com` and
`javascript:` are refused, by two separate rules, because they fail differently.

## Scheduling

`starts_at` / `ends_at` are optional and enforced in the query (`scopeLive`),
not in the panel. A banner cannot outlive its sale because the person who would
have switched it off was away that weekend.

## Movement

One row in `hero_settings`, applied to every banner:

| Setting | Range | Note |
|---|---|---|
| `interval_ms` | 2–30s | also drives the dot that fills while a slide is held |
| `transition` | fade · slide · zoom · none | each adds only a transform; opacity carries all of them |
| `transition_ms` | 0–2000ms | separate from interval — a slower carousel rarely wants a slower wipe |
| `easing` | ease · ease-in-out · linear · spring | `spring` is a curve, not a CSS keyword |
| `ken_burns` | on/off | runs for exactly one slide and holds, so it finishes rather than being cut |
| `autoplay` | on/off | ignored for a single banner — one picture is not a carousel |

`interval_ms` reaching the page is not decoration. It used to be a hardcoded
`6000` in `home.js` beside a hardcoded `6s` in `home.css` — a pair with no
reason to stay equal, and the progress bar finished early the moment either
changed. Now there is one number and both read it.

## The transitions are written twice

Once in `modules/home/home.css` for the storefront, once in
`modules/admin/admin.css` for the panel's preview. Deliberate: the panel does
not load the storefront stylesheet, and linking it to save thirty lines would
drag a whole theme — fonts, hero sizing, variables — into a screen that wants
none of it. Both halves read the same `--hero-*` variables, which is what keeps
them in step.

## Files

```
backend/
  Migrations/   hero_slides, hero_settings (one row, seeded)
  Models/       HeroSlide (scopeLive, href), HeroSetting (current)
  Requests/     HeroSlideRequest — including the same-site link rule
  Controllers/  HeroController (public), AdminHeroController (panel)
  routes.php    one public read, a guarded write side
  endpoints.md  the HTTP contract
hero-page.js    the panel screen, with the live preview
hero-nav.js     the sidebar entry
_fragments/     the panel's <main>
```

## Depends on nothing

It stores a product id and a category slug and builds the URL itself, so it
never asks the catalogue anything. Deleting `modules/catalog` would break where
the banners *point*, not this module. The panel screen imports the media picker
optionally — with `modules/media` gone, the rest of the screen still works and
the button says why it cannot choose a picture.
