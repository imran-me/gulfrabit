# Deals · API contract

Owned by `modules/deals`.

## This module has no backend, deliberately

It owns **no data**. Every product it shows belongs to `modules/catalog`, and it
reads them through `modules/catalog/backend/api.js`:

| What the page shows | Where it comes from |
|---|---|
| product collections | `GET /api/catalog/products` |
| discounted products | `GET /api/catalog/deals` |
| category tiles | `GET /api/catalog/categories` |

Giving this module its own controller would mean **two places** deciding what
"featured" means and how a discount is ordered — which is exactly how a catalog
starts contradicting itself. The one-source-of-truth rule applies across modules,
not just within one.

`backend/api.js` here is a thin re-export so the page has a single import
surface. If this module ever owns data of its own — a curated campaign, an
editorial ordering — it grows a real backend then, and not before.

**Deleting this folder removes the page and nothing else**, which is the test.
