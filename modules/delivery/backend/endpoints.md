# Delivery · API contract

Owned by `modules/delivery`. Written before the code, so the frontend seam
(`backend/api.js`) and the Laravel controller return identical shapes.

Base path: `/api/delivery` — mounted by `DeliveryServiceProvider`, not by any
global routes file.

---

## Types

```ts
type Quote = {
  id: 'metro' | 'nationwide' | 'express';  // stable key; orders reference it
  label: string;                            // "Dhaka & Chattogram"
  eta: string;                              // "Within 72 hours"
  cost: number;                             // whole BDT (server stores poisha)
};

type District = {
  key: string;    // slug — 'dhaka', 'coxs-bazar'
  name: string;   // "Cox's Bazar"
  zone: string;   // Quote['id']
};
```

Money crosses the wire as **whole taka**. It is stored as **poisha** (integer) so
it can never pick up float error; taka is a presentation concern only.

---

## `GET /api/delivery/options`

Every active zone, cheapest first. Renders the checkout list before a district is
chosen, and the Shipping & Returns policy table.

**200**
```json
{ "data": [
  { "id": "metro",      "label": "Dhaka & Chattogram",   "eta": "Within 72 hours",  "cost": 70 },
  { "id": "nationwide", "label": "Rest of Bangladesh",   "eta": "4 working days",   "cost": 130 },
  { "id": "express",    "label": "Express — Dhaka only", "eta": "Next working day", "cost": 150 }
] }
```

Auth: public. A guest must be able to price delivery before creating an account.

---

## `GET /api/delivery/districts`

All 64 districts grouped by division, so a long select stays navigable.

**200**
```json
{ "data": {
  "Barishal": [ { "key": "barguna", "name": "Barguna", "zone": "nationwide" } ],
  "Dhaka":    [ { "key": "dhaka",   "name": "Dhaka",   "zone": "metro" } ]
} }
```

Auth: public. Cacheable — changes a few times a year at most.

---

## `POST /api/delivery/quote`

The charge for one district. This is the number checkout bills.

**Request**
```json
{ "district": "coxs-bazar" }
```

There is deliberately **no `cost` field**. The client may not propose a price;
the server resolves it from the district alone. A posted cost is ignored.

**200**
```json
{ "data": { "id": "nationwide", "label": "Rest of Bangladesh", "eta": "4 working days", "cost": 130 } }
```

**422 — unknown or unserviceable district**
```json
{ "message": "We do not currently deliver to that district.",
  "errors": { "district": ["Unserviceable district."] } }
```

422 rather than a default rate: silently quoting the cheaper metro zone for an
unrecognised address would undercharge, and the order would ship at a loss.

Rate limit: `throttle:60,1` — cheap to serve, but the endpoint an attacker would
hammer to enumerate serviceable areas.

---

## Rules the server owns

1. **The client never sets the delivery price.** The storefront quote is for
   responsiveness only. The order pipeline MUST re-resolve the charge at capture
   time and bill that figure.
2. **Flat per zone** — no weight tiers, no order-value thresholds.
3. **Cold-chain is never a line item.** It is included on perishables, which is
   what the site promises on every page; adding it as a surcharge would break
   that promise.
4. **Zone keys are immutable** once an order references them. Deactivate via
   `is_active`; never rename or delete a zone row.
