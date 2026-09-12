# Marketing · API contract

Owned by `modules/marketing`. Base path `/api/track`, mounted by
`MarketingServiceProvider`. Depends on nothing; nothing depends on it.

| Status | Endpoint |
|---|---|
| **authored** | `POST /track` |
| **authored** | `GET /admin/marketing/campaigns` (admin, admin:orders) |
| **authored** | `GET /admin/marketing/analytics` and three below it (admin, admin:orders) |
| **authored** | `GET /admin/marketing/pixel` (admin, admin:settings) |
| **authored** | `PUT /admin/marketing/pixel` (admin, admin:settings.edit) |
| **authored** | `POST /admin/marketing/pixel/test` (admin, admin:settings.edit, 10/min) |
| **authored** | `POST /admin/marketing/pixel/test-mode` (admin, admin:settings.edit) |
| **authored** | `POST /admin/marketing/pixel/stamp` (admin, admin:settings.edit) |

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

- `event_name` is a closed set, `TrackController::EVENTS`: PageView,
  ViewContent, AddToCart, InitiateCheckout, Purchase, AddToWishlist, Search,
  CompleteRegistration, Contact. Anything else is 422.
- `custom_data` is whitelisted before forwarding (value, currency,
  content_ids, content_name, content_type, contents, num_items,
  search_string) — this endpoint is not a relay.
- The keys come from `MetaPixelSettings::forTracking()`: the ones saved in
  Admin → Pixel setup, or `.env` until anything is saved there.
- Responses: `204` not configured (no pixel id or no token in force) · `202`
  accepted (whether Meta answered or not — failures are logged and the latest
  is shown on Pixel setup, never to the visitor) · `422` malformed · `429`
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

---

## Pixel setup

The three Meta keys, edited in the panel instead of `.env`. The why — the
precedence rule, the page stamp, the one-hour test code — is in the module
README; this is the contract.

All five routes are JSON under `/api/admin`, session cookie + CSRF, `web`
middleware like the rest of the panel. Reading needs `admin:settings`; every
write needs `admin:settings.edit`. Owners hold both by default and nobody else
does: the screen holds a secret, and a save rewrites every storefront page.

**The token never comes back.** Every response carries a preview — the first
six and last four characters — and its length, never the value. The browser
that pasted it is the last place it appears in full.

### `GET /api/admin/marketing/pixel`

What is in force, where it came from, and whether it is working.

```json
{ "data": {
  "source": "panel",
  "pixelId": "1423900436303846",
  "accessToken": { "set": true, "preview": "EAAGxx…9fQz", "length": 184 },
  "testEventCode": "TEST12345",
  "testMode": { "active": true, "until": "2026-09-11T18:05:00+06:00", "minutes": 60, "alwaysOn": false },
  "updatedBy": "Imran",
  "updatedAt": "2026-09-11T17:05:00+06:00",
  "problem": null,
  "pages": { "total": 27, "matching": 27, "ids": { "1423900436303846": 27 } },
  "forwarding": { "available": true, "hours": 24, "sent": 212, "failed": 0, "skipped": 3,
                  "lastSentAt": "2026-09-11T17:04:12+06:00", "lastFailure": null }
} }
```

- `source` is `panel` once anything has been saved there, else `env`, else
  `none`. It names the source of **all three** keys — they are never mixed.
- `problem` is a sentence for the owner, or null. It is set when a saved row
  can no longer be decrypted (`APP_KEY` changed) or the database could not be
  read; `source` then reports `env`, because that is what the server is
  actually using, and saving again repairs the first case.
- `testMode.active` is false once the hour has passed, even though the code
  is still stored, and `until` is null whenever it is not active.
  `alwaysOn: true` means the code comes from `.env`, which has no clock — the
  screen flags it.
- `pages` counts storefront pages by the id their block carries; `""` counts
  pages with the pixel switched off. `matching` is how many carry the id in
  force (or `""` when there is none). Anything else in `ids` means the pages
  disagree and want re-stamping.
- `forwarding` is the last 24 hours of `tracking_events.capi_status`, plus the
  last refusal from Meta in plain words (`{message, at}`, kept 7 days in the
  cache). `available: false` means the table is not there yet and the zeros
  mean "unknown", not "nothing".

### `PUT /api/admin/marketing/pixel`

```json
{ "pixelId": "1423900436303846", "accessToken": "", "removeAccessToken": false,
  "testEventCode": "TEST12345" }
```

- `accessToken: ""` keeps the saved token. The form never holds the real one,
  so an empty box has to mean "unchanged" — otherwise every save that touched
  only the pixel id would wipe the token. Removing it is its own flag,
  `removeAccessToken: true`, so it cannot happen by accident; sending a new
  token and the flag together is a 422.
- `pixelId` is digits or empty; empty switches the pixel off. `pixelId` and
  `testEventCode` must be present (empty is an answer, missing is not).
- Normalised before validation: spaces removed from all three, and a test code
  copied with its `test_event_code:` label is stripped and upper-cased.
- The first save makes the panel the authority for all three keys, including
  any left blank.
- A new or changed test code starts its hour; saving the same code again keeps
  its clock, even one that has run out.
- The pixel in force is written into every storefront page before the response
  returns.

**200** → `{ data: <same as GET>, meta: { stamp: { pages, changed, failed } } }`,
where `failed` maps a page's path to the reason it could not be written.
**422** → `{ message, errors: { pixelId?, accessToken?, testEventCode? } }`,
each a sentence that names where the right value is found. **500** → the
database refused the write (usually a deploy whose migration has not run yet).

### `POST /api/admin/marketing/pixel/test`

No body. The server sends one `PageView` to
`graph.facebook.com/v21.0/{pixel}/events` with the SAVED token and test code;
it appears in Events Manager → Test events, marked as a Server event. It does
not need test mode to be running — the code rides on this one event either way.

**200** → `{ data: { eventsReceived, fbtraceId, testEventCode, eventName, sentAt } }`.
**422** → `{ message }` when a key is missing (all three are needed: without a
test code the event would count as a real visit) or Meta refused, with Meta's
answer explained in plain words and its `code`. **502** → Meta could not be
reached. **429** → pressed more than 10 times a minute; every press is a real
call to Meta on the shop's token.

### `POST /api/admin/marketing/pixel/test-mode`

```json
{ "on": true }
```

`on: true` starts another hour for the saved test code; `on: false` stops it
now. **200** → `{ data: <same as GET> }`. **422** → `{ message }` when nothing
is saved in the panel, when the code comes from `.env`, or when there is no
saved code to turn on.

### `POST /api/admin/marketing/pixel/stamp`

No body. Writes the block for the id in force into every storefront page
again — the same thing the save and `php artisan marketing:pixel-stamp` do.
For when `pages.ids` shows the pages disagreeing: a restore from backup, a
file edited by hand, a deploy whose own stamp failed. Only pages whose bytes
change are rewritten, so pressing it twice changes nothing the second time.
**200** → `{ data, meta: { stamp } }` as for `PUT`. **422** → `{ message }` when
nothing is saved in the panel — `.env` alone never rewrites the pages.
