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
| `backend/Controllers/TrackController.php` | validate → whitelist → forward to Meta, never fail the page |
| `config/services.php` (repo root) | `META_PIXEL_ID`, `META_CAPI_TOKEN`, `META_TEST_EVENT_CODE` out of `.env` |

The browser side lives in `shared/js/core/analytics.js` (event generation,
first-touch UTM capture, the mirror POST) and `shared/js/core/site-config.js`
(the public pixel id). Neither imports anything from this module — the mirror
is a `fetch` with a circuit breaker, so deleting `modules/marketing/` costs
the server copy of events and nothing else.

## States

- **No `.env` keys** — the route answers `204` and forwards nothing. This is
  the shipped state; it becomes live by setting two keys, no deploy.
- **Keys set** — events forward synchronously with a 4s timeout. Meta being
  slow or down is logged and swallowed; the response is `202` regardless,
  because tracking must never be why a page breaks.
- **Module deleted** — the browser's mirror 404s once per page load and its
  circuit breaker stops calling. The pixel keeps working alone.

## Testing against Events Manager

Set `META_TEST_EVENT_CODE` from the Test Events tab, send yourself through
the funnel, watch the events arrive tagged with that code, then clear it.
Purchase events must show **Deduplicated** — if they show as two events, the
`event_id` chain broke somewhere between analytics.js and here.
