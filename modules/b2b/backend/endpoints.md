# B2B · API contract

Owned by `modules/b2b`. Base path `/api/b2b`, mounted by `B2bServiceProvider`.
Depends on `catalog` (products and their tier pricing). One-way.

| Status | Endpoint |
|---|---|
| **authored** | `POST /quotes` · `GET /quotes/{reference}` · `POST /price-check` |
| planned | quote replies, CRM/email notification, BOM upload |

---

## An RFQ is a lead, not an order

Nothing is charged, nothing is reserved, and the real price is agreed by a human
after checking stock, lead time and freight.

Every price this module returns is **indicative** — computed from published tier
pricing — and the payload says so in a field (`indicativeOnly: true`), not just
in this document. A number that reads as an agreed quote when it is not is the
one mistake that costs a B2B relationship.

---

## `POST /api/b2b/quotes`

**Public** · `throttle:5,1`

Procurement staff routinely request quotes before anyone creates an account.
Forcing a signup here loses the lead outright.

The throttle is tighter than the order endpoint on purpose: an RFQ creates a
lead a human then has to read, so flooding it wastes staff time, not just CPU.

```json
{
  "company": "Rahman Electronics Ltd",
  "contact": "Tanvir Ahmed",
  "phone": "01712345678",
  "email": null,
  "notes": "Need delivery before the 20th.",
  "items": [ { "sku": "gr-9001", "qty": 500 } ]
}
```

`items` is an **array from the start**, even though today's form submits one
line. A real RFQ covers several parts — a board, the switches that go on it, and
the relay — and a single `product` column would have to be undone the first time
someone asks for two things.

Note what is absent: **any price**. The submitter says what and how many; what
it costs is ours to work out.

**201**
```json
{ "data": { "reference": "RFQ-2026-K7P2QX", "status": "new",
            "indicativeTotal": 95000, "indicativeOnly": true,
            "items": [ { "sku": "gr-9001", "qty": 500, "indicativeUnit": 190 } ],
            "message": "Request received. Our B2B desk replies within one working day." } }
```

References are **random**, not sequential — a sequential one lets a competitor
submit two requests and read our pipeline volume off the gap.

---

## `GET /api/b2b/quotes/{reference}`

Guests must supply `?phone=` — the phone that submitted it. **The reference alone
is not a credential**: it appears in email threads and screenshots, and the
request contains a competitor's order volumes.

A mismatch is **404, not 403**.

---

## `POST /api/b2b/price-check`

`{ "sku": "gr-9001", "qty": 500 }` — indicative tier pricing, so the storefront
can show "at 500 units this is ৳ 190" before anyone submits anything.

```json
{ "data": { "sku": "gr-9001", "qty": 500, "unitPrice": 190, "lineTotal": 95000,
            "moq": 50, "belowMoq": false, "indicativeOnly": true } }
```

---

## Tier pricing

Stored on the product as `price_tiers`: `[{ qty, price_poisha }]` where `qty` is
the **minimum quantity** for that price.

Resolution sorts descending and takes the first match, so ordering 2,000 gets
the 2,000-unit rate rather than the 50-unit one. `QuoteService::tierPricePoisha()`
mirrors `resolveTierPrice()` in `backend/api.js` — **change both together.**

> A real bug lived here: `CatalogSeeder` read the tier quantity from `qty`/
> `minQty`, but the source data uses `min`. Every tier would have seeded at
> quantity 1, so bulk pricing would have applied from a single unit — a customer
> ordering one PCB would have been charged the 2,000-unit rate. Fixed 2026-07-27.

### Below MOQ is surfaced, not blocked

`belowMoq: true` is returned and the quote is still created. Letting the desk
reply "our minimum is 50, here is the price at 50" keeps the lead; a hard
rejection loses it.

---

## Not built

- **Notification.** Nothing emails or tickets the B2B desk when a quote arrives,
  so submissions currently sit in the table unnoticed. This is the first thing
  to wire up — the feature is useless without it.
- Quote replies (desk → customer) and the `quoted` / `won` / `lost` transitions.
- BOM upload — paste or CSV, line-matched against the catalog. The highest-value
  B2B feature and the one almost no small storefront has.
