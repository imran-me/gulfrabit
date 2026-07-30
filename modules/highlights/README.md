# highlights

Which products appear on the home page, on which shelf, in what order.

Delete this folder, remove its line from `composer.json` and
`bootstrap/providers.php`, and the home page goes back to filling its rails
from the `premium` and `new` tags — which is what it did before this existed.
`modules/home/home.js` calls the endpoint with `fetch`, not `import`, precisely
so a missing module is a fallback rather than a blank page.

---

## What it gives you

| | |
|---|---|
| `GET /api/highlights/{rail}` | public — what the home page puts on that shelf |
| `GET /api/admin/highlights` | staff — every shelf with its products |
| `PUT /api/admin/highlights/{rail}` | staff — replace a shelf, ordered |
| `modules/highlights/highlights.html` | the **Home page** screen in the sidebar |

## Adding a shelf

Two edits, no migration:

1. An entry in `Highlight::RAILS` (key, label, blurb, fallback tag)
2. A `<div class="snap-rail" data-rail="yourkey">` in `index.html`, and a line
   in `initProductSections()` in `modules/home/home.js`

`rail` is a plain string column, so retiring a shelf leaves its rows in the
table, ignored. That is deliberate — taking a shelf out of the design for a
season should not throw away the curation.

## Why not just use the `tags` column

`tags` already has `premium` and `new`, and the home page used to filter on
them in the browser. Three reasons that was not enough:

- **Order.** A tag is a set. The first product in a rail gets looked at most,
  and "which six, and which is first" is a merchandising decision a JSON array
  cannot express.
- **Meaning.** `tags` is also a search and filter facet. Overloaded, you cannot
  mark something premium without also putting it on the front page.
- **Emptiness.** A tag-driven rail shows whatever happens to carry the tag.
  This lets a shelf be deliberately empty, and lets the panel say so.

## Two behaviours worth knowing

**An empty shelf is not blank on the site.** It falls back to the tag. A fresh
install has never had this screen opened, and three empty strips is a worse
failure than the old behaviour. The API response says `source: "curated"` or
`source: "tag"` so the panel can tell the merchant which is happening.

**A curated product that is unlisted, or whose category is switched off, is
dropped from the shelf but kept in the panel** — with the reason written on the
row. A shelf of six rendering four needs an explanation on the screen where it
was configured, not a puzzle on the live site.

## Requires

- `modules/catalog` — products and their categories
- `modules/admin` — the staff session and the sidebar
