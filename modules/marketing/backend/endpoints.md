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

## The Tracking screen

The shop's own copy of its funnel. Meta reports on the ad; these report on the
pages the ad sent people to — **including the ones nobody bought from, which
Meta never sees** — and on what became of the orders after Meta counted them.

Every event the browser mirrors to `POST /api/track` is stored in
`tracking_events` before (or instead of) being forwarded to Meta, with the
visit's channel, landing page, device and browser attached. Storing is wrapped
and never throws: a tracking beacon must not be why a page misbehaves.

Every route sits behind `admin` + `admin:orders` — the same capability as the
orders screen, because this is the same revenue seen from the visitor's side.

### The slice — the same query string for every endpoint

| Parameter | Values |
|---|---|
| `period` | `today` · `yesterday` · `7d` · `30d` · `90d` · `month` · `last_month` · `custom` |
| `from`, `to` | `Y-m-d`, both inclusive, only with `period=custom`; 366 days maximum |
| `channel` | one key of `TrafficClassifier::CHANNELS` |
| `device` | `mobile` · `tablet` · `desktop` · `unknown` |
| `campaign` | a `utm_campaign` value, or `(none)` for visits that carried no tag |

Anything unrecognised falls back to `7d` with no segment rather than erroring:
these are reports opened from a bookmark, and a 422 in place of a dashboard
helps nobody. `?days=1|7|30|90` still works — it is what the old screen sent.

**The comparison period is like for like.** Each preset shifts its whole window
back by its own length, so "today" is set against yesterday UP TO THIS HOUR.
Against a full yesterday, a screen checked at 11 am would report a collapse
every morning.

**Visits, never events.** A shopper who opens eight product pages fires eight
`ViewContent` events; counted raw, that one person makes the middle of the
funnel look eight times healthier than it is. Every stage, rate and breakdown
counts DISTINCT SESSIONS. The definition lives in `TrackerFilter::sessionFacts()`
and every report groups it, which is what keeps the headline conversion rate and
the channel table's conversions in agreement.

### `GET /api/admin/marketing/analytics`

The headline. `filter` (the slice as resolved, with the comparison's dates),
`labels` (every key's word, so the browser keeps no second copy), `options` (the
campaigns and channels the dropdowns offer), `kpis` (thirteen figures, each
`{value, prev}`), `series` (per hour or per day, each point carrying its
comparison), `funnel`, `topPages`, `channels`, `capi`, and `health` — the last
NOT filtered, because a segment with no traffic must not read as "the pixel is
down".

### `GET /api/admin/marketing/analytics/insights`

The same numbers as sentences: `{ insights: [{ id, tone, title, body, tab,
figure }] }`, worst first, at most eight. Fetched separately so the overview
paints without waiting for it. Every rule has a minimum sample — see
`InsightEngine`, where the thresholds are written down.

### `GET /api/admin/marketing/analytics/live`

Who is on the shop now: `active` (visits with an event in the last five
minutes), `inCheckout`, `withCart`, `perMinute` for the last half hour,
`visitors` with what each is looking at and how far it has got, `feed` (the last
hour's events, newest first) and `today`. The period is ignored — now is now —
but the segment applies.

### `GET /api/admin/marketing/analytics/sources`

`channels`, `campaigns`, `ads` (by `utm_content`), `landings`, `referrers`, and
`outcomes`: each channel's orders by what happened to them. Channel is how the
visit ARRIVED; campaign is the ad that FIRST brought the visitor, kept for as
long as the browser keeps it. The same visit can be Direct in one table and an
ad's in the other, and both are right.

### `GET /api/admin/marketing/analytics/audience`

`devices`, `os`, `browsers` (an app's built-in browser is named as itself),
`visitTypes`, `heatmap` (`WEEKDAY()` 0–6 × hour 0–23, in the shop's own time
zone) and `geo` — orders by district, and the Dhaka/outside split that decides a
delivery charge. `geo.source` says whether it counted every order or only the
tracked ones, which it must when a segment is on.

### `GET /api/admin/marketing/analytics/products?sort=`

Per product: `views`, `wishlist`, `carts`, `orders`, the two rates, and what the
catalogue says about it now — title, photo, price, stock. `flags` names the
patterns worth acting on: `look-not-add`, `cart-not-buy`, `oos-demand`, `star`.
`sort` is one of `views|carts|orders|wishlist|cart_rate|order_rate`.

Purchases carry every product in the cart, so they are counted in PHP rather
than unpacked from JSON in SQL — portably unnesting a JSON array across MySQL
and MariaDB is not worth what it would cost to maintain.

### `GET /api/admin/marketing/analytics/search`

`terms`, `empty` (the searches that found nothing — a stock list written by
customers), and `totals`, including what searchers convert at against everyone
else.

### `GET /api/admin/marketing/analytics/checkout`

`abandoned` (count, value, and the newest hundred with what was in each cart),
`steps`, `completion` by browser and by device, `orders` — the reconciliation
between tracked purchases and real orders — and `unmatched`, the purchases with
no order behind them.

### `GET /api/admin/marketing/analytics/sessions?outcome=&limit=&offset=`

Visits, newest first, one row each. `outcome` narrows to `ordered`, `checkout`,
`cart`, `browsed` or `bounced`.

### `GET /api/admin/marketing/analytics/sessions/{session}`

One visit: `session` (channel, device, landing, referrer, campaign, duration),
`events` in order, and `orders` — the order it produced, with what has happened
to it since.

The `{session}` is an opaque random id minted in the browser, not a database
key: there is nothing to enumerate towards, and it identifies a **visit**, not a
person.

### `GET /api/admin/marketing/analytics/export`

The **raw** events of the slice as streamed CSV, UTF-8 with a BOM so Excel
renders Bengali and the taka sign instead of mojibake. Raw rather than
aggregated on purpose: an export exists to take the data somewhere this screen
cannot follow, and a pre-summarised file can only answer the questions the
screen already answers.

Money is `value_taka` in the file and `value_poisha` in the database — the same
rule as everywhere else.

### Privacy

`visitor_id` and `session_id` are random ids in `localStorage`. No name, phone,
IP or fingerprint is stored. The user agent is READ — to say "phone", "Android",
"Facebook app" — and then dropped; a full agent string is half of a
fingerprint. A cleared browser is a new visitor and a second device is a second
visitor, so **visitors is an honest lower bound on people, not a headcount** —
and the screen says so rather than implying precision it does not have. Sessions
rotate after 30 minutes idle.

### Not built

- **No retention job.** Rows accumulate; the `created_at` index makes
  `delete from tracking_events where created_at < ?` cheap when the merchant
  wants it. Deleting a merchant's data on a schedule nobody asked for is worse
  than a large table.
- **No cross-device stitching**, and no plan for it — that needs identity this
  deliberately does not collect.
- **No abandoned-cart calling list.** A visit that did not order left no name or
  phone number here, and this module will not start collecting one. What the
  Checkout tab says instead — the cart, the device, the ad that brought it — is
  usually the more useful sentence anyway.

Obvious crawlers ARE dropped before an event is recorded, by user agent
(`TrackController::looksAutomated`), so they do not inflate the top of the
funnel. The list is conservative: a real customer missing from the merchant's
own report is worse than a crawler counted as one.

---

## Ad spend

What the campaigns cost, so the panel can divide revenue by it. Read from
Meta's Marketing API into `campaign_spend`, one row per campaign per day —
the shape Meta reports and the only one that can answer any window afterwards.

**Why the shop keeps a number Meta already has.** Meta counts a Purchase when
"Place order" is pressed. In a cash-on-delivery shop that is a promise, and
Meta will never learn which promises were kept. `orders.status` does. With the
spend beside it, the Campaigns screen reports what a DELIVERED order cost —
the figure Ads Manager cannot compute for a COD shop.

Reading is `admin:orders`, the same capability as the revenue it is divided
into. Changing where the money is read from is `admin:settings.edit`: it is a
credential, and an exchange rate that is wrong rewrites every cost-per-order
on the screen.

### `GET /api/admin/marketing/ad-spend?days=7|30|90|365`

`settings` (never the token itself — only whether there is one and where it
came from), `rows` for the window, and `byCampaign`, the same spend keyed by
the utm_campaign it belongs to.

### `PUT /api/admin/marketing/ad-spend`

`{ accountId, token?, removeToken?, takaPerUnit? }`. The account id is stored
digits-only, so `act_123` and `123` are the same account said two ways. The
token is optional: without one the Conversions API token is used, which may or
may not carry `ads_read`.

### `POST /api/admin/marketing/ad-spend/sync`

Pulls `act_<id>/insights` at campaign level with `time_increment=1` for the
last `days` days and writes over what it finds — Meta revises a day's spend for
a day or two, and the unique key on campaign and date makes re-reading free.

**200 either way.** A refusal from Meta is an ANSWER this screen shows in
words: `{ ok: false, message }` naming the permission or the key that has to
change. A sync that answered 500 would put the one sentence the merchant needs
into the browser's console.

It **refuses rather than guess**: an account billing in something other than
taka with no rate set stops with that sentence rather than adding dollars to
taka.

### `POST /api/admin/marketing/ad-spend/rows`

`{ campaign, spendDate, taka }` — money Meta cannot see: a boosted post, an ad
from another account, an influencer paid in cash. Stored with `source=manual`,
and **a sync never overwrites a manual row**: it is somebody's record of money
that has no other record.

### `DELETE /api/admin/marketing/ad-spend/rows/{id}`

Manual rows only. A row that came from Meta is re-created by the next sync, so
deleting it would be a lie that lasts a day.

### `POST /api/admin/marketing/ad-spend/map`

`{ map: { "<meta campaign id>": "<utm_campaign>" } }`.

The join everything rests on: Meta knows a campaign by its NAME, the shop knows
it by the utm_campaign on the ad's link. The two are compared with both
flattened to lowercase dashes — "Sales BD — Cold (Sept 2026)" matches
`sales-bd-cold-sept-2026` — and where that is not enough this map wins.

Spend that still matches nothing is reported as its own row rather than
dropped. An ad running without utm tags is real, common, and invisible
everywhere else; the row is how the merchant finds out.

### `php artisan marketing:ad-spend-sync --days=7`

The same pull, for cron. Once a day is plenty.

### What `GET /admin/marketing/campaigns` gained

Each row now carries `spendTaka`, `delivered`, `returned`, `deliveredTaka`,
`costPerOrder`, `costPerDelivered`, `roas` and `roasDelivered`, plus
`spendOnly` for a campaign that spent and sold nothing. `meta` gains
`spendTaka`, `deliveredTaka`, `adDeliveredTaka`, both blended returns, and the
ad-spend settings so the screen can say what is missing.

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
