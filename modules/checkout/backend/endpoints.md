# Checkout · Backend endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/checkout/shipping-quote` | delivery options + costs for an address/cart |
| POST | `/orders` | create an order from the cart (auth) → `{ id, status, total }` |
| GET | `/orders/{id}` | fetch an order (confirmation / tracking) |
| POST | `/payments/intent` | **payment gateway** — create a payment intent |
| POST | `/payments/webhook` | gateway → server payment status callback |

Critical
- **Never trust client totals.** Recompute subtotal + delivery + tax server-side
  from the cart and the shipping quote before charging.
- Payment integration (bKash / Nagad / card gateway) replaces the mock
  "place order" in `checkout-page.js` (`// TODO: connect to payment gateway`).
- Create the order in a `pending` state, confirm on the gateway webhook.
