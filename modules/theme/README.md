# theme

Two storefront looks, and the switch between them.

| Theme | What it is |
|---|---|
| **Classic** | The shop as it was before this module existed. White canvas, cyan and lime. **The default.** |
| **Luxe** | Ivory canvas, gold trim, slower motion. The brand colours still carry every button. |

## One theme, everyone

The theme is a property of the **shop**, not of a visitor. The merchant picks
it once and every visitor gets it, the same way they all get the same prices.
There is no per-visitor preference and there must never be one.

A universal setting needs somewhere central to live, so **the server is the
only authority**. `localStorage` appears in this module purely as a *mirror* of
the last answer the server gave, so a returning visitor paints the right theme
immediately instead of flashing the other one.

**Only `theme.js` writes that mirror, and only after a successful server read.**
The admin panel deliberately does not. An earlier version had it write the
value on publish "so the merchant sees it straight away", which meant that with
no backend the write succeeded locally, the merchant opened the shop and saw
Luxe, and every real visitor still saw Classic. A control that shows you a shop
nobody else is looking at is worse than one that fails, because the failure
stays invisible until a customer mentions it.

### Priority, highest first

1. **`?theme=` in the URL** — a *preview*. Never stored beyond the tab, never
   published, and it suppresses the server correction so the person previewing
   can actually see what they came to look at.
2. **The server**, via `GET /api/theme`.
3. **The mirror** of the server's last answer, applied before first paint by
   the inline bootstrap in `<head>`.
4. **Whatever theme was baked into the HTML** at build time.

A failure at 2 falls through to 3, and 3 to 4. The shop must never be
unreachable because a decoration endpoint is down.

The bootstrap acts in **both directions**: a page built as Luxe whose mirror
says Classic removes the attribute. Without that, switching the shop back would
never reach anyone who had already visited.

### Verified

With the API live: two independent browser profiles plus a never-seen-before
visitor all followed a publish, in both directions, four switches in a row. A
returning visitor holding a stale `luxe` mirror correctly flipped to Classic on
the next load. A preview tab showed Luxe, survived navigation, wrote no mirror,
and left a second tab in the same browser on the published theme.

## Without a backend, the build is the authority

On a static deployment there is no server to hold a universal setting, so the
theme baked into the HTML is what every visitor gets — still universal, just
changed by a rebuild instead of a click:

```
python tools/assemble.py --theme luxe     # or: --theme classic (the default)
```

This also rewrites `index.html`, which is hand-authored rather than assembled
and would otherwise be the one page the flag missed — a shop whose home page is
Classic and whose every other page is Luxe is not a theme, it is a bug.

The Appearance screen detects this case, says so in plain words, disables
Publish rather than pretending, and points at the command. Preview still works.

## The admin panel is deliberately NOT themed

`assemble.py` passes `luxe=False` to `head()` and `theme=False` to `scripts()`
for admin pages, so they get neither the stylesheet nor the runtime, and
`--theme` never sets the attribute on them. Switching the *shop* must not
restyle the merchant's *tools* under them — if it did, there would be no way to
tell what you just did to the storefront from what you just did to the screen
you are standing on.

## The one CSS rule

`theme-luxe.css` is scoped entirely under `[data-theme="luxe"]`. Nothing in it
can reach a page without the attribute, so Classic renders byte-identical to a
site where this module was never added. Verified across 7 pages × 2 widths:
Classic keeps `--surface-page: #FFFFFF` / `--border-hairline: #E5E9E7`
everywhere, Luxe gets `#FCFBF7` / `#E9E0CB`.

That is not a style preference. The switch is only trustworthy if the OFF
position is genuinely untouched — so if you add to this theme, add inside the
scope.

## Nothing here is load-bearing

No rule in `theme-luxe.css` starts an element at `opacity: 0`, hides anything
pending JavaScript, or gates a layout on a transition finishing. Every
animation is decoration over content that is already visible and already in the
HTML.

That is written down because this codebase has twice shipped a decorative
animation that hid the shop (see `modules/home/home.css`), and a theme is
exactly the kind of change that would do it a third time.

All motion is gated on `prefers-reduced-motion`. Reduced motion keeps the
colours, the hairlines and the fully-drawn rules; it drops the drift, the
sheens and the draw-in. Verified: `lux-drift` → `none`, transitions → ~0s,
rules still at `scaleX(1)` so nothing is left half-rendered.

## The second setting: home layout

The same module also owns **how the home page is arranged** — the `Home layout`
screen, `/admin/layout`. Seven sections, each with the shapes it can honestly
take, and **a separate answer for phones and for computers**, because that is
the whole point: a looping row of category tiles is right on a 390px screen and
wrong on one where eight fit across with room to spare.

| Section | Shapes | Default (computer / phone) |
|---|---|---|
| Shop by Category | `grid`, `loop` | grid / grid |
| Trust strip | `static`, `loop` | static / **loop** |
| Premium Picks | `march`, `rail`, `grid` | march / march |
| Best Sellers | `grid`, `rail`, `march` | grid / grid |
| New Arrivals | `march`, `rail`, `grid` | march / march |
| Trusted origins | `wall`, `loop` | wall / wall |
| Testimonials | `slider`, `grid`, `loop` | slider / slider |

`loop` is a row that travels right-to-left for ever; `march` is a product shelf
that drifts on its own; `rail` is the same row moved only when it is pushed.

**Every default is the page exactly as authored**, so a shop that has never
opened the screen — and a visitor whose stamp never ran — sees the site in the
repository. That is what makes a failed read harmless.

It reaches the page as ONE already-resolved attribute, stamped before the first
paint by the bootstrap in `index.html`:

```html
<html data-lay="category:loop trust:static premium:march …">
```

so every rule in `modules/home/home.css` is a flat
`html[data-lay~="category:loop"]` rather than the same block written out under
two breakpoints. The dividing line is **768px**, and the admin screen says so
in its column headings.

`?lay=` previews an arrangement the same way `?theme=` previews a theme: never
stored, never published, and it suppresses the server read. The panel offers
one preview link per column.

The **defaults exist in three places** — `HomeLayout::SECTIONS`,
`modules/home/home-layout.js`, and the inline bootstrap in `index.html`. That
is deliberate and each carries a note: the site is deployable with no backend,
so the client needs its own copy, and the pre-paint stamp cannot import a
module. The server stays the authority wherever there is one.

## Backend

| Route | Auth | Notes |
|---|---|---|
| `GET /api/theme` | public | Never 500s, never 404s. A missing table means "classic". |
| `GET /api/admin/theme` | `admin:content` | What the panel shows as Live. |
| `PUT /api/admin/theme` | `admin:content` | Validated against `SiteSetting::THEMES`. |
| `GET /api/home-layout` | public | Same guarantee. A missing table means the shipped arrangement. |
| `GET /api/admin/home-layout` | `admin:content` | The live layout and the vocabulary behind it. |
| `PUT /api/admin/home-layout` | `admin:content` | Normalised rather than 422'd — see the controller. |

`site_settings` is a general key/value table, not a `themes` table — the theme
is the first shop-wide setting and will not be the last.

The stored value ends up in an HTML attribute on every page of the site, so it
is validated on write **and** re-checked on read, in case someone edits the
database by hand.

`admin:content` rather than a new capability: the people trusted with the words
on the site are the people who should be trusted with its appearance.

Needs `composer dump-autoload` (new PSR-4 namespace) and `php artisan migrate`.

## Deleting this module

Safe. The storefront treats a failed `/api/theme` as Classic — which is what
the static HTML already ships. Remove the folder, its lines in
`tools/assemble.py` (`luxe_link`, `theme_attr`, `sync_index_theme`, the
`scripts()` entry, `ADMIN_NAV`, `ADMIN_PAGES`), its PSR-4 entry in
`composer.json` and its provider in `bootstrap/providers.php`.

Visitors with a `gr:theme` mirror would keep Luxe with no stylesheet to apply —
which resolves to Classic, because the attribute alone does nothing.
