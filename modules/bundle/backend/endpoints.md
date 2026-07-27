# Bundle — HTTP contract

One endpoint. `modules/bundle/backend/api.js` is the frontend seam that mocks
it; swap the fetch inside `getBundleFor()` and `bundle.js` does not change.

---

## `GET /api/bundles/{sku}`

The pairing to show on a product page.

**Auth:** none. A pairing is catalogue data — identical for every visitor and
cacheable at the edge.

**Params**

| name  | in   | notes                                        |
|-------|------|----------------------------------------------|
| `sku` | path | the product being viewed. `[A-Za-z0-9-]{1,32}` |

**200**

```json
{
  "data": {
    "id": "bdl-iftar-table",
    "title": "The dates-and-honey table",
    "reason": "Medjool dates, Sidr honey and pistachios are the three things that end up on the same plate at iftar and at every gathering after it.",
    "source": "curated",
    "anchor": { "id": "gr-1001", "title": "…", "price": 1450, "originalPrice": 1800, "moq": null, "…": "…" },
    "companions": [
      { "id": "gr-1002", "…": "…" },
      { "id": "gr-1201", "…": "…" }
    ]
  }
}
```

`anchor` and `companions` are full storefront product objects
(`Product::toStorefrontArray()`), so the client needs no second round-trip to
price the block. `moq` matters: one tick of a part with an MOQ means that many
units, and the client's totals depend on it.

### `source` — and why the client must not decide it

| value          | the client prints            | server emits it when                          |
|----------------|------------------------------|-----------------------------------------------|
| `behavioural`  | *Frequently bought together* | ≥ 5 distinct **paid** orders contain the pair  |
| `curated`      | *Goes well together*         | otherwise                                      |

The heading is a factual claim about other customers. The browser cannot verify
it and must not assert it, so the server sends which one it computed and the
client only chooses wording.

The co-purchase count is deliberately server-side. The aggregate is small; the
order table behind it is every customer's basket, and shipping that to the
browser to run the same sum would be a data leak with a UI feature as its
excuse.

**204 No Content**

No pairing for this product, or every companion is out of stock. Not a 404: the
product exists and the request was fine. A 404 here would read in the client's
logs like a broken product page.

`bundle.js` treats a failure of any kind as "no block" and leaves the rest of
the product page intact — the pairing is an enhancement, never a dependency.

---

## Ordering rules

- Companions come back in the merchant's authored order, not the database's.
  `whereIn` does not preserve sequence, so the service re-orders explicitly.
- A product may belong to several bundles (walnuts are on the cheese board and
  in the nut jar). The first active bundle by `sort_order` wins — that ordering
  comes from the position in `data/bundles.json`, which is the merchant's
  priority.
- Out-of-stock and delisted members are dropped, not greyed out. This block
  exists to be added to a cart.

## Caching

Safe to cache publicly. Invalidate on: product stock/price change, a bundle
edit, or an order reaching `paid` (which can move a pairing over the
behavioural threshold).
