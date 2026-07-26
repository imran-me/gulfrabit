# Cart · API contract

Owned by `modules/cart`. Base path `/api/cart`, mounted by `CartServiceProvider`.

**Public, because the cart is guest-first.** Checkout is guest-by-default in this
market, so requiring auth to hold a basket would block a large share of orders.
Identity is an **httpOnly `gr_cart` cookie** for guests, or the authenticated
user. The cookie is httpOnly so page JS cannot read or forge it — which cart you
are looking at is not something the client gets to choose.

---

## The rule this module exists to enforce

**The client never sends a price.** It sends a SKU and a quantity. Every figure
in `totals` is resolved server-side from the products table.

`AddCartItemRequest` has no `price` field at all, so a posted price cannot be
trusted by accident. A cart that trusts a client price is a cart that can be
bought for one taka.

---

## Types

```ts
type CartLine = {
  lineId: number;         // address for PATCH/DELETE — not the SKU
  id: string;             // product SKU
  title: string;
  brand: string;
  image: string | null;
  variant: string | null;
  qty: number;
  price: number;          // CURRENT unit price, whole BDT
  lineTotal: number;
  inStock: boolean;
  priceChanged: boolean;  // true if it moved since it was added
  addedPrice: number;     // what it cost when added
};

type CartPayload = {
  items: CartLine[];
  count: number;                                   // sum of qty
  promo: string | null;
  totals: { subtotal: number, discount: number, total: number };
  notices: string[];                               // out of stock, price moved
};
```

`totals.total` is **goods only**. Delivery is deliberately excluded — it depends
on the district, and `modules/delivery` owns that price. Checkout adds it.

`priceChanged` and `notices` exist so the cart can *say* something changed
rather than quietly charging a different number.

---

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/cart` | current cart |
| `POST` | `/api/cart/items` | `{ sku, qty?, variant? }` · `throttle:60,1` |
| `PATCH` | `/api/cart/items/{lineId}` | `{ qty }` — **`qty: 0` removes the line** |
| `DELETE` | `/api/cart/items/{lineId}` | |
| `DELETE` | `/api/cart` | empty the cart and drop the promo |
| `POST` | `/api/cart/promo` | `{ code }` · `throttle:20,1` |
| `DELETE` | `/api/cart/promo` | |
| `POST` | `/api/cart/merge` | **auth** — fold the guest cart in after login |

**Every one returns the whole cart**, never a partial patch:

```json
{ "data": { "items": [], "count": 3, "promo": "GULF10",
            "totals": { "subtotal": 4650, "discount": 465, "total": 4185 },
            "notices": [] } }
```

Clients that merge partial responses drift out of sync with the server's totals,
and the cart is the one screen where a wrong number is unforgivable.

**422** responses:

- adding an out-of-stock or withdrawn product — a real state the customer can
  act on, not a server fault
- an invalid promo, or a basket below the code's minimum spend

---

## Promo codes are data, not code

Rules live in the `promotions` table: `type` (`pct`/`flat`), `value`,
`min_subtotal_poisha`, `max_discount_poisha`, a start/end window, and an
optional `usage_limit`. Marketing changes a discount far more often than
engineering deploys; hardcoding codes is how you ship a hotfix for a coupon.

Behaviour worth knowing:

1. **Only the code is stored on the cart.** The discount is recomputed on every
   read, so a promo that expires or stops qualifying stops applying by itself.
2. **"Unknown code" and "expired code" return the same message.** Telling a
   guesser their guess was once real is a small oracle.
3. **"Below minimum spend" is its own reason**, because it is actionable — the
   customer can add another item. Collapsing it into "invalid code" loses a sale.
4. **`used_count` increments on order creation, not on typing a code**, or a
   browsing customer exhausts a limited campaign without buying anything.
5. Discount can never exceed the goods subtotal.

---

## Guest → user merge

`POST /api/cart/merge`, called once immediately after login.

Quantities are **added**, not overwritten: 2 added while logged out plus 1 saved
earlier means 3 were wanted, and silently dropping either is worse than a number
the customer can edit. The guest's promo carries over only if the user had none.
The whole merge is one transaction — a half-merged cart is worse than either
half — and the guest cookie is cleared afterwards so a stale token cannot
resurrect an empty cart.

---

## Not yet built

- **Save for later** (`POST /cart/save-for-later/{lineId}`) — the frontend has
  the UI; the server side is not written.
- **Stock reservation.** Nothing is held when an item enters the cart, so two
  customers can both add the last unit. Checkout must re-check availability.
