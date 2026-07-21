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
