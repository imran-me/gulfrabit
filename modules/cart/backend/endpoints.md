# Cart · Backend endpoints

The cart is `localStorage`-backed today (shared `state.js`). Once a user is
authenticated it should sync to a server cart.

| Method | Path | Purpose |
|---|---|---|
| GET | `/cart` | current user's cart |
| POST | `/cart/items` | add `{ productId, qty, variant }` |
| PATCH | `/cart/items/{id}` | update qty |
| DELETE | `/cart/items/{id}` | remove line |
| POST | `/cart/save-for-later/{id}` | move to saved |
| POST | `/cart/promo` | validate + apply a promo code → returns discount |

Notes
- Merge the guest (localStorage) cart into the server cart on login.
- Promo validation MUST be server-side; the client codes are a mock only.
- Price is always recomputed server-side at checkout (never trust client totals).
