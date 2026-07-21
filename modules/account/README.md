# Module · Account

The signed-in area: dashboard, orders, addresses, wishlist. Shared sidebar
layout (`account.css`), with `account-common.js` providing the soft auth guard,
logout, and status-badge helper.

| Page | Fragment | JS |
|---|---|---|
| Dashboard | `dashboard.main.html` | `account-page.js` |
| Orders | `orders.main.html` | `orders-page.js` |
| Addresses | `addresses.main.html` | `addresses-page.js` |
| Wishlist | `wishlist.main.html` | `wishlist-page.js` |

- **Orders** merges locally-placed orders with the mock `orders.json` history,
  filterable by status (Processing/Shipped/Delivered).
- **Addresses** is full CRUD, localStorage-backed, seeded from the mock user.
- **Wishlist** renders saved products via the shared card with move-to-cart.
- Auth is soft (a demo session is created if none exists) so the area is
  explorable. // TODO: backend — enforce real JWT auth + redirect to login.

## Backend
`backend/endpoints.md` + `backend/api.js` — profile, orders, addresses, wishlist.
