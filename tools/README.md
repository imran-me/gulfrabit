# tools/ — author-time helpers (not shipped to the browser)

## `assemble.py`

Composes the final static HTML pages from the canonical header/footer partials
(`shared/components/*.html`) + each module's `_fragments/<page>.main.html`.

```bash
python tools/assemble.py
```

Output is plain static HTML with the header/footer **inlined** — the shipped
site is content-first and needs no JS to render its chrome. This is an authoring
convenience only; there is no runtime build step.

**Edit the fragment, not the generated `.html`.** Re-run after changing a
fragment or the shared header/footer. `index.html` is authored by hand (not via
the assembler) because it's the flagship page.

## `qa-viewport.html`

Responsive QA harness. Headless Chrome **clamps its viewport to ~526px**, so a
`--window-size=375` screenshot is really a 526px render cropped to 375 — it looks
broken when nothing is wrong. This page frames the site in iframes of an exact
width (an iframe establishes its own viewport for media queries), so 375/414/768
render truthfully, and it **measures** `scrollWidth` vs `clientWidth` to report
real horizontal overflow with the offending elements named.

```bash
python -m http.server 5210 --directory .
# then screenshot:
#   /tools/qa-viewport.html                       → 375 + 414 + 768, all with verdicts
#   /tools/qa-viewport.html?w=375&h=560&s=1150    → one width, scrolled to a band
#   /tools/qa-viewport.html?u=../modules/cart/cart.html   → audit another page
```

`s=` forces an instant scroll (the site sets `scroll-behavior: smooth`, which
never completes under `--virtual-time-budget`).

## `qa-seed.html`

Seeds `localStorage` then redirects to `?to=<page>`, so cart- and checkout-
dependent pages can be inspected in their **populated** state:

```bash
chrome --headless --dump-dom \
  "http://localhost:5210/tools/qa-seed.html?to=../modules/checkout/checkout.html"
```

Needed because `--dump-dom` serialises only the top document — dumping
`qa-viewport.html` never shows the framed page's markup. Use the iframe harness
for *visual* QA (it seeds a cart with `?cart=1`) and this seeder for *DOM*
assertions. `?cart=empty` exercises the empty-cart guard instead.

`?cart=N` seeds N real products into `localStorage` before framing the page —
cart and checkout render an empty state otherwise, so their forms never reach
the DOM and cannot be audited. Omit it and the harness clears the cart first, so
empty states can be audited too.

## `php-check.py` and `module-deps.py`

There is no `php` binary on this machine, so these stand in for the checks a
real toolchain would give you. Neither replaces `php -l`, PHPStan or Pint — run
those the moment a PHP toolchain exists.

```bash
python tools/php-check.py     # opener, balanced delimiters, namespace vs PSR-4 path, unused imports
python tools/module-deps.py   # cross-module `use` graph + cycle detection
```

`module-deps.py` is the important one: the architecture rests on modules being
independently deletable, and a dependency **cycle** silently breaks that. The
graph must stay one-way (today: `cart` → `catalog`; `checkout` → `cart`,
`catalog`, `delivery`).

## `htaccess-check.py`

Simulates the root `.htaccess` blocking rules against real repo paths. Apache is
not available here, so this only checks the regexes — but a wrong pattern
silently 404s files the browser needs, and that would not surface until the site
was live.

```bash
python tools/htaccess-check.py
```

It asserts both directions: that `modules/*/backend/api.js` and
`modules/*/data/*.json` stay **reachable** (they are frontend files), and that
PHP, fragments, `vendor/`, `storage/` and `.env` stay **blocked**. An early
draft denied `modules/*/backend/` wholesale and would have taken the whole
storefront down; this check exists because of that.

## `font-test.html`

Proves the self-hosted Bengali face is actually **loaded and selected**, not
silently falling back to a system font — which is precisely the failure Daraz
and Ghorer Bazar ship.

```bash
python -m http.server 5210 --directory .
# then open /tools/font-test.html
```

It checks `document.fonts` for the face and its status, runs `fonts.check()`,
and measures the same Bangla string in the real family versus a fallback — if
the widths match, the font is not being used no matter what the CSS says.

`?focus=<selector>` focuses an element inside the frame. Separate from
`?click=` because `el.click()` does not reliably move focus in headless, so
focus-triggered UI — search suggestions, `:focus-within` styling — would
silently never render and you would screenshot a page that looks fine and
isn't tested.
