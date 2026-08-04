# Catalog · API contract

Owned by `modules/catalog`. Base path `/api/catalog`, mounted by
`CatalogServiceProvider` — not by any global routes file.

Everything below is **public and read-only**. The catalog is the shop window;
admin writes will live behind an auth group in their own module.

| Status | Endpoint |
|---|---|
| **authored** | `GET /products` · `GET /products/{sku}` · `GET /suggest` · `GET /deals` · `GET /categories` · `GET /categories/{slug}` |
| planned | `GET /products/{sku}/reviews` · `POST /products/{sku}/reviews` (auth) |

> Reviews are still localStorage-backed on the frontend. They need the auth
> module before they can be written server-side, so they are deliberately not
> stubbed here.

---

## Types

```ts
type Product = {
  id: string;                   // SKU — 'gr-1101'. Immutable once ordered.
  title: string;
  brand: string | null;
  origin: string | null;        // country of origin — a trust signal
  barcode: string | null;       // EAN-13, checkable against the pack
  categorySlug: string;
  categoryName: string;
  subSlug: string | null;
  price: number;                // whole BDT (stored as poisha)
  originalPrice: number | null; // null = not discounted, never equal to price
  image: string | null;
  images: string[];
  rating: number;
  reviewCount: number;
  inStock: boolean;
  tags: string[];
  dietary: string[];
  shortDescription: string | null;
  description: string | null;
  moq: number | null;           // B2B only
  priceTiers: { qty: number, price_poisha: number }[] | null;
  specs: Record<string, string> | null;
  datasheet: string | null;
  createdAt: number | null;     // unix seconds
};

type Category = {
  slug: string; name: string; icon: string | null;
  image: string | null; blurb: string | null;
  audience: 'retail' | 'b2b';
};
```

**Money crosses the wire as whole taka**, stored as integer poisha so it cannot
pick up float error. `originalPrice` is `null` — not equal to `price` — when
there is no discount, or the UI cannot tell the two cases apart.

Every endpoint returning a product returns the **same object shape**, so the
frontend never branches on which call produced it.

---

## `GET /api/catalog/products`

Backs the PLP, search results and every product grid.

| Query | Type | Notes |
|---|---|---|
| `category` | slug | must exist |
| `q` | string | title, brand, origin, short description |
| `brands[]` `origins[]` | string[] | max 30 each |
| `tags[]` `dietary[]` | string[] | max 12 each |
| `minPrice` `maxPrice` | int (taka) | `maxPrice` must be ≥ `minPrice` |
| `rating` | 0–5 | minimum |
| `inStock` `onSale` | bool | |
| `sort` | enum | `featured` (default) · `price-asc` · `price-desc` · `newest` · `rating` |
| `perPage` | int | default 24, **hard max 60** |

`sort` is whitelisted rather than passed through — it reaches an `ORDER BY`, and
an open sort parameter is a column-enumeration hole.

**200**
```json
{ "data": [ /* Product[] */ ],
  "meta": { "total": 44, "perPage": 24, "currentPage": 1, "lastPage": 2 } }
```

**422** on an unknown category, an unknown sort, or `maxPrice < minPrice`.

> **Not yet returned: facet counts.** The sidebar currently derives brand and
> origin counts client-side from the loaded set, which is correct for 44 SKUs
> and wrong at scale. When this endpoint grows a `facets` block,
> `filters-sidebar.js` should read it instead of counting.

---

## `GET /api/catalog/products/{sku}`

Bound on **SKU**, not the auto-increment id. Returns the product plus its
`related` array so the PDP is a single request.

**200** → `{ "data": { ...Product, "related": Product[] } }`
**404** when the SKU is unknown or the product is inactive.

---

## `GET /api/catalog/suggest?q=&limit=`

Autocomplete. Matches **title and brand only** — deliberately narrower than
`/products`, so the dropdown stays predictable instead of matching description
prose. Returns a trimmed payload; a dropdown needs no spec sheet.

**200** → `{ "data": [ { id, title, brand, image, categorySlug } ] }`

Rate limit `throttle:120,1` — it fires on every debounced keystroke.

---

## `GET /api/catalog/deals?limit=`

Discounted products, **deepest percentage saving first**. The ordering is
computed in SQL so it survives pagination; sorting a single page in PHP would
silently reorder only that page.

**200** → `{ "data": Product[] }`

---

## `GET /api/catalog/categories?audience=`

Top-level categories each with their `children`, so the mega-menu is one call.
`audience` is `retail` or `b2b`.

**200** → `{ "data": [ { ...Category, "children": Category[] } ] }`

## `GET /api/catalog/categories/{slug}`

**200** → `{ "data": { ...Category, "productCount": 6, "children": Category[] } }`

`productCount` is included so the PLP header can say "6 products" without a
second round trip.

---

## Rules the server owns

1. **Filtering and sorting happen in SQL**, never in PHP. The mock frontend
   filters an in-memory array because it has 44 products; the server must not,
   or the first thousand-SKU import falls over.
2. **`perPage` is capped at 60.** An unbounded page size is a denial-of-service.
3. **Inactive and soft-deleted products are invisible** to every endpoint here.
4. **SKUs are immutable** once an order references one.
5. The seeder reads the same `modules/catalog/data/*.json` files the storefront
   reads, so seeded data and mock data cannot drift.
