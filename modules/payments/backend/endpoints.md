# Payments · API contract

Owned by `modules/payments`. Base path `/api/payments`, mounted by
`PaymentsServiceProvider`.

Depends on `checkout` (reads orders, settles them). One-way: checkout does not
know payments exists.

| Status | Endpoint |
|---|---|
| **authored** | `GET /methods` · `POST /intent` · `GET /callback/{gateway}` |
| planned | gateway webhooks (server-push confirmation, belt-and-braces) |

---

## The rule this module exists to enforce

**A query string never decides that money moved.**

The gateway redirect arrives with `status=success` written by whoever controls
the browser. Every callback therefore asks the gateway server-to-server
(bKash *execute*/*payment status*, Nagad *verify/payment*) and only that answer
can mark an order paid — through `PaymentService::recordOutcome()`, the single
code path allowed to write `payment_status = paid`. The admin panel cannot;
the client certainly cannot. This is checkout's founding rule ("only a gateway
callback may set paid") made real.

A failed payment never fails the order: the order exists before payment
starts, and COD stands behind every attempt.

---

## `GET /api/payments/methods`

Public. `{ "data": { "bkash": bool, "nagad": bool } }` — config presence, no
database. The checkout page draws only the gateways that are true; on a static
host the call 404s and the page keeps its no-backend behaviour.

## `POST /api/payments/intent`

`throttle:10,1`. Request: `{ "order": "GR-2026-XXXXXX", "phone": "01…" }`.

The phone must match the order (tracking-page rule; mismatch is **404, not
403** — that an order number exists is itself information). The gateway used
is the order's own `payment_method`; you cannot pay a COD order online by
posting a different key.

**200** → `{ "data": { "redirect": "https://…" } }` — send the browser there.
**422** already paid · **501** gateway not configured / order is COD ·
**502** gateway unreachable (the order stands; pay on delivery).

Each intent writes a `payments` row — an order can accumulate several
(cancelled inside bKash, tried again, gave up): that history settles support
arguments the orders table cannot.

## `GET /api/payments/callback/{gateway}`

Where the gateway's redirect lands. Verifies server-to-server, records the
outcome, then 302s the browser to
`/modules/checkout/order-confirmation.html?id=GR-…&payment=success|cancelled|failed`.

Idempotent: gateways reserve the right to bounce a browser twice, and the
second arrival finds nothing left to do.

---

## Payment row shape

```
order_id · gateway (bkash|nagad) · amount_poisha (snapshot at intent)
status: initiated → completed | failed | cancelled
gateway_ref   bKash paymentID / Nagad paymentReferenceId
trx_id        what the customer sees in their own app
response      the gateway's last raw answer, kept for disputes
```
