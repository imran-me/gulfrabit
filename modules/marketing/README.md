# Marketing

The server half of ad tracking. One endpoint, one job: take the event the
browser already sent to Meta's pixel and send it again through the
[Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api),
with the same `event_id` so Meta merges the pair instead of counting twice.

Why twice at all: the browser pixel alone loses a meaningful share of events
to iOS tracking prevention, ad blockers and in-app browsers — and Facebook's
in-app browser is where this shop's paid traffic lives. The server copy
carries the matching signals the browser can't be trusted to report (IP, user
agent, Meta's `_fbp`/`_fbc` cookies) and survives everything a content
blocker can do.

## Parts

| Piece | Job |
|---|---|
| `backend/routes.php` | `POST /api/track`, throttled 120/min/IP |
| `backend/Controllers/TrackController.php` | validate → record → whitelist → forward to Meta, never fail the page |
| `analytics.html` + `analytics-page.js` + `tracker/` | the Tracking screen — eight tabs over one filter row, off `tracking_events` |
| `backend/Services/TrackerFilter.php` | the slice every report reads: a period, the period compared with, one channel / device / campaign — and the one definition of a visit |
| `backend/Services/AnalyticsService.php` | the headline, the chart, the funnel, the live view, one visit's trail |
| `backend/Services/TrackerReports.php` | channels, campaigns, ads, landing pages, devices, browsers, hours, products, searches, abandoned checkouts |
| `backend/Services/OrderOutcomes.php` | each tracked purchase matched to its order — delivered, returned, cancelled, never placed |
| `backend/Services/InsightEngine.php` | the same numbers as sentences, each with a floor under it |
| `backend/Services/TrafficClassifier.php` | user agent + referrer + landing URL → channel, device, browser |
| `backend/Services/VisitContext.php` | pins a visit's channel, landing page and new-or-returning to its first event |
| `campaigns.html` + `campaigns-page.js` | the Campaigns screen — what each ad sold, per period |
| `backend/Controllers/AdminCampaignController.php` | the grouping behind it, off orders.ad_source — with spend, cost per delivered order and both returns on spend |
| `backend/Services/MetaAdSpend.php` | reads spend per campaign per day from Meta's Marketing API; refuses rather than add dollars to taka |
| `backend/Services/AdSpendSettings.php` | the ad account, the optional ads_read token, the rate, and the campaign→utm map |
| `php artisan marketing:ad-spend-sync` | the same pull, for a daily cron |
| `pixel.html` + `pixel-page.js` + `pixel.css` | the Pixel setup screen — the three Meta keys |
| `backend/Services/MetaPixelSettings.php` | which keys are in force: the panel's row, or `.env` until there is one |
| `backend/Services/PixelStamp.php` | writes the pixel block into every storefront page on the server |
| `php artisan marketing:pixel-stamp` | the same, run by `deploy.sh`; `--check` reports what the pages carry |
| `shared/components/meta-pixel.html` (repo root) | Meta's snippet — the one template the build and the server both write from |
| `config/services.php` (repo root) | `META_PIXEL_ID`, `META_CAPI_TOKEN`, `META_TEST_EVENT_CODE` out of `.env` — the fallback until Pixel setup has something saved |

The browser side lives in `shared/js/core/analytics.js` (event generation,
first-touch UTM capture, the mirror POST) and `shared/js/core/site-config.js`
(the build-time default pixel id — see Pixel setup below). Neither imports
anything from this module — the mirror is a `fetch` with a circuit breaker, so
deleting `modules/marketing/` costs the server copy of events and nothing else.

## States

- **Nothing configured** — no row saved in Pixel setup and no `.env` keys. The
  route records the event as `skipped`, answers `204` and forwards nothing.
- **`.env` keys, nothing saved in the panel** — the state the module shipped
  in, and it behaves exactly as it did before the panel existed.
- **Saved in the panel** — the panel is the authority for all three keys and
  `.env` is not read at all. See *Which keys are in force* below.
- **Keys in force** (from either source) — events forward synchronously with a
  4s timeout. Meta being slow or down is logged and swallowed, and the latest
  refusal is shown on Pixel setup; the response is `202` regardless, because
  tracking must never be why a page breaks.
- **Pixel switched off in the panel** — every page's block shrinks to an empty
  `gr-meta-pixel` line, no pixel loads, and nothing is forwarded to Meta.
- **Panel row unreadable** — `APP_KEY` has changed since it was saved. The
  screen says so and the server falls back to `.env` until the keys are saved
  again.
- **Module deleted** — the browser's mirror 404s once per page load and its
  circuit breaker stops calling. The pixel keeps working alone, with whatever
  id was last written into the pages until the next deploy puts the build's
  back.

## Pixel setup

**Admin → Pixel setup** (`/admin/pixel`, sidebar group Settings) holds the
three Meta keys, so changing the pixel or the Conversions API token is a paste
in the panel rather than an `.env` edit on the server (File Manager — SSH is
blocked from the owner's network), a config cache rebuild, and a site-config.js
change pushed through a rebuild.

| Key | What it is |
|---|---|
| Pixel ID | the 15–16 digit dataset number from Events Manager. Public — it ships in every page |
| Conversions API access token | Events Manager → Settings → Generate access token. **Secret** |
| Test event code | optional, from Events Manager → Test events; see below |

It sits behind the `settings` permission — `admin:settings` to open it,
`admin:settings.edit` to change anything — which only owners hold by default.
It holds a secret and it changes what every storefront page sends to Meta;
neither is a job for whoever happens to be packing orders.

### Where the keys are kept

`marketing_settings`, a key/value table this module owns, row `meta_pixel`.
The value is encrypted with the app key (an `encrypted:array` cast, as courier
credentials are), so a database dump — the usual way these leak — carries
ciphertext. The token never goes back to the browser in full: the screen gets
its first six and last four characters and its length, which is enough to tell
which token is saved and useless to anyone reading over a shoulder.

### Which keys are in force

Once anything is saved in the panel, the panel is the authority for **all
three** keys. Until then the server reads `META_PIXEL_ID`, `META_CAPI_TOKEN`
and `META_TEST_EVENT_CODE` from `.env`, exactly as before.

Never mixed per key. If a blank field in the panel fell through to `.env`,
clearing the token to switch the Conversions API off would quietly bring back
whatever old token `.env` still held, and nobody reading the screen could say
which source a given key came from. `MetaPixelSettings` is the one place that
decides, and `TrackController` reads the keys through
`MetaPixelSettings::forTracking()`.

### Why the id is written into the HTML

It would be simpler to fetch the id at runtime, and it would not work. Meta's
install check and the Event Setup Tool read the page **source** for `init`
followed by `track('PageView')`; a pixel injected after the page loads reads
as "no pixel detected". So the id has to be in the bytes the server sends, and
changing it means rewriting the pages.

Every storefront page carries a managed block in `<head>`:

```html
<!-- GENERATED-PIXEL-BEGIN -->
<meta name="gr-meta-pixel" content="1423900436303846">
<!-- Meta Pixel - base code … -->
<script> … fbq('init', '1423900436303846'); … fbq('track', 'PageView', …); </script>
<!-- GENERATED-PIXEL-END -->
```

Two writers fill it from one template, `shared/components/meta-pixel.html`:

- **The build** (`tools/assemble.py`) writes the id from `metaPixelId` in
  `site-config.js` — the build-time default.
- **The server** (`PixelStamp`) rewrites it in every storefront page when the
  panel is saved. Writes are atomic, and only pages whose bytes change are
  touched. Admin pages carry no block.

Both must produce the same bytes for the same id. That is what makes a stamp of
the id the build already wrote a no-op, and what makes "N pages changed" on the
screen mean something.

Switched off, the block keeps only `<meta name="gr-meta-pixel" content="">`.
`analytics.js` reads that line (`pagePixelId()`) before it looks at
site-config.js, so a pixel switched off in the panel is not switched back on
by the build's default. Only a page with no block at all falls back to
site-config.js.

### The deploy step

`deploy.sh` takes new code with `git reset --hard`, which puts the committed
pages back — carrying the build's id. Step 4b runs
`php artisan marketing:pixel-stamp` straight after the migrations to write the
panel's pixel in again. It does nothing when nothing is saved in the panel. A
failure is logged loudly and does not stop the deploy: the pages still carry a
working pixel, just the build's.

For the few seconds between the reset and the stamp, visitors get the build's
id. **Keep `metaPixelId` in site-config.js equal to the panel's id** and those
seconds switch nothing.

`php artisan marketing:pixel-stamp --check` reports what the pages carry
without writing anything.

### Test event code — an hour at a time

A test event code sends the server's events to Events Manager's Test events
tab instead of the real stream, and ads never learn from that tab. Left set by
mistake, it quietly takes every real conversion out of optimisation while the
ads keep spending. So a code saved in the panel is used for **60 minutes**
after it is saved, or after **Turn on for 1 hour**, and then ignored without
anyone having to remember.

A code from `.env` keeps the old always-on behaviour, and the screen flags it.

**Send test event** has the server send one PageView to
`graph.facebook.com/v21.0/{pixel}/events` with the saved token and test code.
It appears in Events Manager → Test events marked as a Server event, which
proves the token, the pixel id and the server's route out to Meta in one
press. It needs all three keys — without a test code it would be counted as a
real visit. Throttled to 10 a minute.

### What else the screen shows

- The last 24 hours of `tracking_events.capi_status` — sent, failed, skipped.
- The last error from Meta, in plain words. Kept in the cache for 7 days,
  because a refused token otherwise shows up only in `laravel.log`, which
  nobody running the shop reads.
- How many pages carry which pixel, with **Write it into every page again**
  for when they disagree.
- A live check of the home page as visitors actually get it, through the CDN —
  a page rewritten on disk but still cached at the edge is the one this finds.

### Deleting the module

The pages keep whatever pixel was last written into them until the next
deploy resets them to the build's id. `/api/track` 404s once per page and
analytics.js's circuit breaker stops calling, as before. `marketing_settings`
stays behind, like every module's tables.

## Testing against Events Manager

1. Paste the code from Events Manager → Test events into Pixel setup and save.
   It is live for an hour.
2. Press **Send test event**. A PageView marked Server should appear within
   seconds — that is the server half proved on its own.
3. Send yourself through the funnel and watch both copies arrive. Purchase
   events must show **Deduplicated** — if they show as two events, the
   `event_id` chain broke somewhere between analytics.js and here.

Nothing to clear afterwards: the code stops being used on its own after 60
minutes. A code set in `.env` still has to be cleared by hand.
