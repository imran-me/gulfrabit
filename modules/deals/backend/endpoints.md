# Deals · Backend endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/deals` | active discounted products (server-computed) |
| GET | `/deals/campaigns` | promo campaigns with start/end windows |

Notes
- Today deals are derived client-side from `originalPrice > price` (see
  `data-service.getDeals()`). Server should own discount rules, campaign windows
  and any time-boxed flash sales, and return the resolved sale price.
