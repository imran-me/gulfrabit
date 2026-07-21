# Account · Backend endpoints

All require auth (bearer JWT).

| Method | Path | Purpose | Replaces (mock) |
|---|---|---|---|
| GET | `/account/profile` | user profile + tier | `state.getUser()` |
| PATCH | `/account/profile` | update name/phone | — |
| GET | `/orders` | order history (paginated, `?status=`) | `orders.json` + local |
| GET | `/orders/{id}` | order detail / tracking | — |
| GET | `/addresses` · POST · PATCH `/{id}` · DELETE `/{id}` | address CRUD | localStorage |
| POST | `/addresses/{id}/default` | set default address | localStorage |
| GET | `/wishlist` · POST · DELETE `/{productId}` | wishlist | `state` wishlist |

Notes
- On login, merge the guest wishlist (localStorage) into the account.
- Orders are read-only to the customer; status transitions come from the admin
  dashboard / fulfilment system.
