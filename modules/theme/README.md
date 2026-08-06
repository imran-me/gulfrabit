# theme

Two storefront looks, and the switch between them.

| Theme | What it is |
|---|---|
| **Classic** | The shop as it was before this module existed. White canvas, cyan and lime. **The default.** |
| **Luxe** | Ivory canvas, gold trim, slower motion. The brand colours still carry every button. |

## The one rule

`theme-luxe.css` is scoped entirely under `[data-theme="luxe"]`. Nothing in it
can reach a page without the attribute, so Classic renders byte-identical to a
site where this module was never added. Verified across 7 pages × 2 widths:
Classic keeps `--surface-page: #FFFFFF` / `--border-hairline: #E5E9E7`
everywhere, Luxe gets `#FCFBF7` / `#E9E0CB`.

That is not a style preference. The switch in the admin panel is only
trustworthy if the OFF position is genuinely untouched — so if you add to this
theme, add inside the scope.

## How a page finds out which theme it is in

The storefront is static HTML but the theme is a runtime setting, so there are
three sources, in priority order:

1. **The inline bootstrap in `<head>`** (written by `tools/assemble.py`, and by
   hand in `index.html` — the two copies must be edited together) reads the
   last known theme from `localStorage` and sets the attribute *before the
   first paint*. No network, no module graph.
2. **`theme.js`** asks `GET /api/theme` and corrects the page if the cache was
   stale, then refreshes the cache.
3. **If the server cannot be reached, whatever step 1 applied stands.**

Step 3 is the important one, and it is the same rule the header menu and the
home page shelves follow: a fetch that fails leaves the authored page standing.
A theme is decoration — the shop must never be unreachable because a preference
endpoint is down.

**One flash, once per browser.** A first-time visitor to a Luxe shop has no
cache, so they get a single paint of Classic before step 2 corrects it. That is
the honest cost of a static build plus a runtime setting. Blocking the render
on a network call would be worse for every visit after the first.

## The admin panel is deliberately NOT themed

`assemble.py` passes `luxe=False` to `head()` and `theme=False` to `scripts()`
for admin pages, so they get neither the stylesheet nor the runtime. Switching
the *shop* to Luxe must not restyle the merchant's *tools* under them — if it
did, there would be no way to tell what you just did to the storefront from
what you just did to the screen you are standing on.

## Nothing here is load-bearing

No rule in `theme-luxe.css` starts an element at `opacity: 0`, hides anything
pending JavaScript, or gates a layout on a transition finishing. Every
animation is decoration over content that is already visible and already in the
HTML.

That rule is written down because this codebase has twice shipped a decorative
animation that hid the shop (see `modules/home/home.css`), and a theme is
exactly the kind of change that would do it a third time.

All motion is gated on `prefers-reduced-motion`. Reduced motion keeps the
colours, the hairlines and the fully-drawn rules; it drops the drift, the
sheens and the draw-in. Verified: `lux-drift` → `none`, transitions → ~0s,
rules still at `scaleX(1)` so nothing is left half-rendered.

## Backend

| Route | Auth | Notes |
|---|---|---|
| `GET /api/theme` | public | Never 500s, never 404s. A missing table means "classic". |
| `GET /api/admin/theme` | `admin:content` | What the panel shows as Live. |
| `PUT /api/admin/theme` | `admin:content` | Validated against `SiteSetting::THEMES`. |

`site_settings` is a general key/value table, not a `themes` table — the theme
is the first shop-wide setting and will not be the last.

The stored value ends up in an HTML attribute on every page of the site, so it
is validated on write **and** re-checked on read, in case someone edits the
database by hand.

`admin:content` rather than a new capability: the people trusted with the words
on the site are the people who should be trusted with its appearance.

## Deleting this module

Safe. The storefront treats a failed `/api/theme` as Classic — which is what
the static HTML already ships. Remove the folder, its lines in
`tools/assemble.py` (the `luxe_link`, the `scripts()` entry, `ADMIN_NAV`,
`ADMIN_PAGES`), its PSR-4 entry in `composer.json` and its provider in
`bootstrap/providers.php`, and the site is exactly the site it was before.

Visitors with `gr:theme` still cached would keep Luxe with no stylesheet to
apply — which resolves to Classic, because the attribute alone does nothing.
