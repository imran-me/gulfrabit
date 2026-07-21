# Module · Cart

The editable cart (`cart.html`) — the source of truth the mini cart-drawer
mirrors.

- **Fragment:** `_fragments/cart.main.html` · **Styles:** `cart.css` ·
  **Behaviour:** `cart-page.js`.
- Line items: qty stepper, remove, **save for later**. Live order summary with a
  mock **promo code** (`GULF10`, `HOP500`). Sticky mobile checkout CTA.
- State lives in shared `state.js` (localStorage) — edits here reflect instantly
  in the header badge and drawer, and across tabs.

## Backend
`backend/endpoints.md` + `backend/api.js` — cart read/write + promo validation.
Cart becomes server-side once the user is authenticated.
