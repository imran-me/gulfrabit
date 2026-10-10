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

## Two ways in, one way of writing an order

`OrderService` has two public doors and one private room:

| Door | Caller | Basket |
|---|---|---|
| `placeFromCart()` | `POST /api/orders` — the storefront | the customer's saved cart, locked |
| `placeManual()` | `POST /api/admin/orders` — a custom order typed in by staff | a `Cart` built in memory from the typed lines, never saved |

Both hand their basket to **`capture()`**, which does everything that makes an
order an order: availability, delivery, promotion, the pre-order split, the
snapshot, the order number. A custom order therefore cannot be priced
differently from a website order — there is no second copy of the arithmetic
for it to be priced by. `quoteManual()` runs the same figures without writing.

Two things differ, and only these:

- **`channel`** (`orders.channel`, default `website`). `placeManual()` sets it
  to how the order came in; the storefront's request has no such field.
- **The COD abuse guards** — the ten-minute duplicate check and the five-a-day
  cap — are skipped when staff vouch for the order. They exist to stop a
  script, and the cap's own message tells the customer to ring the shop.

## A line is charged at its PACK's price

`CartItem::currentUnitPricePoisha()` asks `Product::pricePoishaFor($variant)`,
which is the one place a line's unit price is decided. A product with packs
has a price per pack; `products.price_poisha` is only the price of the pack
the shop preselects.

Until 2026-10-10 every line was charged from `price_poisha` alone — so a
customer who chose 1 kg was shown the 1 kg price by the product page, the cart
and the express checkout, and the order was then written, slipped and
collected at the default pack's price. A line with no pack, or a label that
matches nothing, still falls back to the product price.

## The street address is optional — in the table too

`PlaceOrderRequest` has allowed an order without a street address since the
express checkout was shortened; `orders.address_line` was still `NOT NULL`
until `2026_10_10_000002`, so that order was an INSERT the database refused.
Every reader of the column already treats empty as "not recorded yet".

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
