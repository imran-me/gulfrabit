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

## The order pipeline

`Services/OrderFulfilmentService::TRANSITIONS` is a **whitelist** — not "reject
a few silly moves" but "permit exactly these". It lives here rather than in
`modules/admin` because these are rules about orders, not about a screen: a
courier webhook, a customer cancelling, and a staff member clicking a button
must all obey them.

```
placed ─┬─→ confirmed ──→ packed ─┬─→ ready_for_courier ──→ shipped ──→ delivered
        │                          └────────────────────────↗              │
        ├─→ cancelled  (also from confirmed, packed, ready_for_courier)     │
        └─→ spam                                    returned ←─────────────┘
```

| Stage | The panel calls it | What it means |
|---|---|---|
| `placed` | Placed | it arrived; nobody has spoken to them yet |
| `confirmed` | Confirmed | a human called and the customer said yes |
| `packed` | Packing | being made up |
| `ready_for_courier` | Ready for courier | sealed, labelled, waiting by the door |
| `shipped` | With courier | a rider has it |
| `delivered` | Delivered | — |
| `cancelled` / `returned` | Cancelled / Returned | terminal |
| `spam` | Spam | it was never a real order |

Two of these were added on 2026-08-13 and are worth explaining:

**`ready_for_courier`** exists because `packed → shipped` hid a real physical
wait. A sealed parcel is not with a courier; it is on the bench, and somebody
has to hand it over. That gap is where parcels get lost — nobody can answer
"what is waiting for a rider today?" if the answer requires remembering.
`packed → shipped` stays legal on purpose: the stage is a queue, not a toll
gate, and a pick-up scan that arrived before anyone clicked the button must not
strand the order.

**`spam`** exists because in a COD market a share of orders are not orders — a
wrong number, a bored child, a competitor. Filing those as `cancelled` poisons
the one figure a merchant most needs to trust: the cancellation rate is supposed
to measure orders that were *real* and went wrong. Junk gets its own drawer so
the real numbers stay honest. Reachable only from `placed`: an order somebody
confirmed on a call was real, and if it later goes wrong that is a cancellation
with a reason.

`cancelled`, `returned` and `spam` are closed to the `warehouse` role, and the
panel requires a typed reason for all three.

The frontend's matching vocabulary — labels, button verbs, pill tones — is
`modules/admin/order-stages.js`, in one file so the table and the buttons can
never call the same stage two different things.
