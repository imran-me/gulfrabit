# Marketing · API contract

Owned by `modules/marketing`. Base path `/api/track`, mounted by
`MarketingServiceProvider`. Depends on nothing; nothing depends on it.

| Status | Endpoint |
|---|---|
| **authored** | `POST /track` |
| **authored** | `GET /admin/marketing/campaigns` (admin, admin:orders) |

## POST /track

The browser event mirror. Body, all from `shared/js/core/analytics.js`:

```json
{
  "event_name": "Purchase",
  "event_id": "9b2f…",
  "event_time": 1754300000,
  "event_source_url": "https://gulfrabit.com/modules/checkout/express.html?sku=gr-1101",
  "attribution": { "utm_source": "facebook", "utm_campaign": "decor-aug", "fbclid": "…" },
  "custom_data": { "value": 1450, "currency": "BDT", "content_ids": ["gr-1101"] }
}
```

- `event_name` is a closed set: PageView, ViewContent, AddToCart,
  InitiateCheckout, Purchase. Anything else is 422.
- `custom_data` is whitelisted before forwarding (value, currency,
  content_ids, content_name, content_type, contents, num_items) — this
  endpoint is not a relay.
- Responses: `204` not configured · `202` accepted (whether Meta answered or
  not — failures are logged, never surfaced) · `422` malformed · `429`
  throttled.
- The forwarded event carries `user_data` built server-side: client IP, user
  agent, `_fbp`/`_fbc` cookies, with `_fbc` reconstructed from a first-touch
  `fbclid` when the cookie itself was blocked.

**The rule this module exists to enforce:** the same `event_id` the pixel
used, always — deduplication is the entire point of the second copy.

## GET /admin/marketing/campaigns

Orders and revenue grouped by the recruiting ad. `?days=7|30|90|365` (default
30). Rows: `{campaign, source, medium, orders, cancelled, revenueTaka,
lastOrderAt}` — grouped by `utm_campaign` falling back to `utm_source`, with
one `(organic)` bucket for orders no ad produced. Cancelled orders are counted
per row but excluded from revenue: a campaign whose orders cancel is producing
junk, and averaging that away is how junk keeps getting bought. Meta:
`{days, totalOrders, adOrders, adRevenueTaka, revenueTaka}`.

---

## The pixel dashboard

The shop's own copy of its funnel. Meta reports on the ad; these report on the
pages the ad sent people to — **including the ones nobody bought from, which
Meta never sees**.

Every event the browser mirrors to `POST /api/track` is now stored in
`tracking_events` before (or instead of) being forwarded to Meta. Storing is
wrapped and never throws: a tracking beacon must not be why a page misbehaves.

All four routes sit behind `admin` + `admin:orders` — the same capability as the
orders screen, because this is the same revenue seen from the visitor's side.

### `GET /api/admin/marketing/analytics?days=1|7|30|90`

Headline numbers, the funnel, top pages, campaigns, Conversions API health.

```json
{ "data": {
  "days": 7, "events": 1840, "visitors": 412, "sessions": 503,
  "purchases": 11, "revenueTaka": 8420,
  "funnel": [
    { "stage": "PageView",         "sessions": 503, "dropOffPct": null, "ofTopPct": 100 },
    { "stage": "ViewContent",      "sessions": 214, "dropOffPct": 57,   "ofTopPct": 43 },
    { "stage": "AddToCart",        "sessions": 63,  "dropOffPct": 71,   "ofTopPct": 13 },
    { "stage": "InitiateCheckout", "sessions": 28,  "dropOffPct": 56,   "ofTopPct": 6 },
    { "stage": "Purchase",         "sessions": 11,  "dropOffPct": 61,   "ofTopPct": 2 }
  ],
  "topPages":  [{ "path": "/buy", "sessions": 190, "views": 240 }],
  "campaigns": [{ "utm_campaign": "sales-bd-cold-sept2026", "utm_source": "facebook",
                  "sessions": 320, "purchases": 9, "revenue_poisha": 690000 }],
  "capi": { "sent": 0, "failed": 0, "skipped": 1840 }
} }
```

**Stages count DISTINCT SESSIONS, never events.** One shopper opening eight
product pages fires eight `ViewContent` events; counted raw, that person alone
makes the middle of the funnel look eight times healthier than it is. `dropOffPct`
is against the **previous** stage, so one bad screen shows as one bad number
rather than dragging every row beneath it down.

`dropOffPct` is `null` for the first stage and whenever the previous stage saw
nobody — "no one got here to drop out" is a different fact from "everybody
dropped out", and showing 100% for the first sends the merchant to fix a screen
that works.

### `GET /api/admin/marketing/analytics/sessions?days=&limit=&offset=`

Recent visits, newest first: when it started, what brought it, how many pages,
and the furthest step it reached.

### `GET /api/admin/marketing/analytics/sessions/{session}`

One visit's footprint — every event it fired, in order, capped at 500.

The `{session}` is an opaque random id minted in the browser, not a database
key: there is nothing to enumerate towards, and it identifies a **visit**, not a
person.

### `GET /api/admin/marketing/analytics/export?days=`

The **raw** events as streamed CSV, UTF-8 with a BOM so Excel renders Bengali
and `৳` instead of mojibake. Raw rather than aggregated on purpose: an export
exists to take the data somewhere this screen cannot follow, and a pre-summarised
file can only answer the questions the screen already answers.

Money is `value_taka` in the file and `value_poisha` in the table — the same
rule as everywhere else.

### Privacy

`visitor_id` and `session_id` are random ids in `localStorage`. No name, phone,
IP or fingerprint is stored. A cleared browser is a new visitor and a second
device is a second visitor, so **visitors is an honest lower bound on people,
not a headcount** — and the screen says so rather than implying precision it
does not have. Sessions rotate after 30 minutes idle.

### Not built

- **No retention job.** Rows accumulate; the `created_at` index makes
  `delete from tracking_events where created_at < ?` cheap when the merchant
  wants it. Deleting a merchant's data on a schedule nobody asked for is worse
  than a large table.
- **No bot filtering.** Crawler traffic is counted as visits. It shows up as
  sessions with a single PageView and no referrer if you go looking.
- **No cross-device stitching**, and no plan for it — that needs identity this
  deliberately does not collect.
