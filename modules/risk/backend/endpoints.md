# Risk · API contract

Owned by `modules/risk`. Mounted by `RiskServiceProvider` under `web` with an
`api` prefix — the panel authenticates with a session cookie, and the `api`
middleware group has none.

Reads `orders` (owned by `modules/checkout`). Owns no tables, writes nothing.

| Status | Endpoint |
|---|---|
| **authored** | `GET /api/admin/risk` (admin, admin:orders) |
| **authored** | `GET /api/admin/risk/phone` (admin, admin:orders) |

## GET /api/admin/risk

`?days=30|90|180|365`, default 90. Anything else falls back rather than
erroring: it is a screen opened from a bookmark.

```json
{ "data": {
  "shop": {
    "days": 90, "orders": 142, "delivered": 96, "failed": 21, "pending": 25,
    "decided": 117, "failedPct": 17.9, "lostTaka": 18400, "deliveredTaka": 82100,
    "districts": [{ "district": "Cumilla", "orders": 9, "delivered": 5, "failed": 4, "failedPct": 44.4, "lostTaka": 3600 }],
    "payments":  [{ "method": "cod", "orders": 130, "delivered": 88, "failed": 20, "failedPct": 18.5 }]
  },
  "watchlist": { "days": 90, "total": 12, "rows": [
    { "phone": "017…", "name": "…", "orders": 4, "delivered": 1, "failed": 3,
      "failedPct": 75, "lostTaka": 4200, "districts": ["Cumilla"], "lastAt": "…", "band": "risky" }
  ] }
}}
```

**Districts are ranked worst first and need at least three decided parcels.**
One refusal out of one order is a refusal, not a bad district, and a screen
that says otherwise sends a merchant to change a courier over noise.

**The watchlist is ranked by parcels LOST, not by rate.** One customer who
refused four costs four times what one who refused their only order did, and a
rate alone puts the second at the top.

## GET /api/admin/risk/phone

`?phone=01712345678&exclude=GR-26091203`

The number is normalised the way the checkout normalises it before saving —
`+88`, spaces and dashes all find the same orders. A string that is not a
Bangladeshi mobile number comes back as `new` with that said in the reason,
rather than as an error: the field is a paste target.

`exclude` keeps the order being looked at out of its own verdict. Without it
every first-time customer reads as "one order in flight, nothing delivered".

```json
{ "data": {
  "band": "watch", "delivered": 2, "failed": 2, "pending": 0, "decided": 4,
  "failedPct": 50, "lostTaka": 2900, "spentTaka": 3100, "spam": 0,
  "reason": "2 parcels of 4 came back or were cancelled. Worth a confirmation call before dispatch.",
  "orders": [{ "orderNumber": "GR-…", "status": "returned", "taka": 1450,
               "district": "Cumilla", "payment": "cod", "at": "…" }]
}}
```

**Why the phone is in the query string and not the path.** A number in a URL
path ends up in access logs, in browser history and in anything that copies a
link. It is the shop's own customer either way, but there is no reason to
spread it further than the screen that asked.

## The bands

See `modules/risk/README.md` — the table is there rather than here because it
is a product decision the screen prints in words, not a wire format.

Only DECIDED orders count toward a rate. An order still with the courier is not
evidence either way; it is reported separately as "on the way now", and three
of them with nothing delivered is its own reason to call.
