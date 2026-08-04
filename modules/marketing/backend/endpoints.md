# Marketing · API contract

Owned by `modules/marketing`. Base path `/api/track`, mounted by
`MarketingServiceProvider`. Depends on nothing; nothing depends on it.

| Status | Endpoint |
|---|---|
| **authored** | `POST /track` |

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
