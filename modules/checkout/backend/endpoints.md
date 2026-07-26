# Checkout · API contract

Owned by `modules/checkout`. Base path `/api/orders`, mounted by
`CheckoutServiceProvider`.

Depends on `cart`, `catalog` and `delivery`. That dependency is one-way — none
of those three knows checkout exists.

| Status | Endpoint |
|---|---|
| **authored** | `POST /orders` · `GET /orders/{number}` · `GET /orders` (auth) |
| planned | `POST /payments/intent` · `POST /payments/webhook` |

---

## The rule this module exists to enforce

**The client proposes nothing that costs money.**

`PlaceOrderRequest` accepts an address, a district, a delivery choice and a
payment method. It has **no field for subtotal, discount, delivery charge or
total** — not validated-and-ignored, *absent*, so a figure cannot be smuggled in
by accident.

At capture, `OrderService` recomputes every number: goods from the products
table, delivery from the district's zone, discount from the promo rules. The
whole thing runs in **one transaction** with the cart lines locked — a
half-written order, or a cart cleared without an order, is far worse than a
failed checkout the customer can retry.

---

## `POST /api/orders`

Public — guest checkout is the default path in this market.
`throttle:10,1`, because this is the endpoint that writes money-bearing rows.

**Request**
```json
{
  "name": "Rahim Uddin",
  "phone": "01712345678",
  "email": null,
  "address": "House 12, Road 4, Dhanmondi",
  "area": "Dhanmondi",
  "district": "dhaka",
  "notes": null,
  "delivery": "metro",
  "payment": "cod"
}
```

Required: `name`, `phone`, `address`, `district`, `delivery`, `payment`.
`email`, `area` and `notes` are optional — the phone number is the identity
primitive here, and a large share of buyers have no email.

`phone` must match `^(?:\+?88)?01[3-9]\d{8}$` and is stored normalised
(`8801712345678` → `01712345678`) so lookups by phone actually match.

**201** → `{ "data": Order }`

**422** — all states the customer can act on, not server faults:
empty cart · an item went out of stock or was withdrawn · the district is
unserviceable · validation failed.

### The delivery choice is honoured, not obeyed

A posted `delivery` key only applies if it is genuinely available for that
district. `express` for Sylhet falls back to that district's real zone — a
client cannot buy a next-day promise where we don't run a next-day service.

---

## `GET /api/orders/{order_number}`

**Guests must supply `?phone=` as well as the order number.** The number alone
is not a credential — anyone who saw a screenshot could otherwise read the
customer's address. Signed-in owners need no phone.

A mismatch returns **404, not 403**: confirming that an order number exists is
itself information worth withholding.

Order numbers are `GR-2026-XXXXXX` with a **random** suffix, not sequential — a
guessable number lets someone walk the tracking page through other people's
orders.

---

## `GET /api/orders` (auth)

The signed-in customer's history, paginated 20 per page.

---

## Order shape

```ts
type Order = {
  id: string;              // GR-2026-A7K2QX
  date: string;            // YYYY-MM-DD
  status: 'placed'|'confirmed'|'packed'|'shipped'|'delivered'|'cancelled'|'returned';
  payment: 'bkash'|'nagad'|'card'|'cod';
  paymentStatus: 'pending'|'paid'|'failed'|'refunded';
  delivery: string;        // zone key
  eta: string;             // "Within 72 hours"
  address: string;         // flattened snapshot
  phone: string;
  promo: string | null;
  totals: { subtotal: number, discount: number, delivery: number, total: number };
  total: number;           // kept for the existing frontend
  items: OrderItem[];
  cancellable: boolean;
};
```

---

## An order is a historical record, not a view

This drives most of the schema:

- **Order lines are full snapshots** — title, brand, image, unit price. They do
  not read through to the product. A product can be renamed, repriced or
  delisted and the order must still print what was bought and paid.
- `product_id` is nullable with `nullOnDelete`: losing a product must never
  damage the record of an order that contained it.
- **The address is flat strings**, not a foreign key to `addresses`. Editing a
  saved address must never rewrite where a past parcel was sent.
- **The delivery zone key and ETA are stored**, not joined. Repricing or
  deactivating a zone cannot rewrite history.

## Promo redemption

`used_count` increments **at order creation**, never when a code is typed —
otherwise browsing customers exhaust a limited campaign without buying anything.

---

## Payment — not built

`payment_status` starts at `pending` for every method, including COD (which is
owed on delivery, not paid). **Only a gateway callback may set `paid`.**

Still to build: `POST /payments/intent` and `POST /payments/webhook`, plus the
bKash/Nagad/card integration that replaces the mock place-order in
`checkout-page.js`.

## Not built

- **Stock reservation.** Nothing is held when an item enters the cart, so two
  customers can both hold the last unit. `OrderService::assertAvailable()`
  catches it at capture, which is the last safe moment, but under real
  contention a proper reservation or a decrement-with-check is needed.
- Order cancellation and returns endpoints (`cancellable` is computed and
  exposed; nothing consumes it yet).
