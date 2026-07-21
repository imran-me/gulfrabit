/**
 * Cart · module API
 * Today the cart lives in shared state.js (localStorage). This wrapper is the
 * seam where a server cart slots in — the page keeps using state.js for the
 * guest cart and these functions for sync once authed.
 */

// TODO: backend — implement against /cart endpoints and merge guest cart on login.
export async function syncCartToServer(/* cart */) { /* no-op in mock */ return true; }
export async function validatePromo(code) {
  // Mirror of the mock in cart-page.js; server is the real authority later.
  const PROMOS = { GULF10: { type: 'pct', value: 10 }, HOP500: { type: 'flat', value: 500 } };
  return PROMOS[code?.toUpperCase()] ?? null;
}
