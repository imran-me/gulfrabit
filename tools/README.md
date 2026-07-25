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
