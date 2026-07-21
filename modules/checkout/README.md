# Module · Checkout

Multi-step checkout + order confirmation.

- **checkout.html** (`_fragments/checkout.main.html`, `checkout-page.js`):
  Address → Delivery → Payment → Review progress stepper, real client-side
  validation, live order summary. Prefills from the mock user. Placing an order
  writes it to local order history and routes to confirmation.
  **No real payment is processed** — `// TODO: connect to payment gateway`.
- **order-confirmation.html** (`confirmation.main.html`, `confirmation-page.js`):
  order number, summary, ETA, track/continue/print actions.
- **Styles:** `checkout.css`.

## Backend
`backend/endpoints.md` + `backend/api.js` — shipping quotes, order creation and
the payment-gateway integration point.
