/**
 * state — the app's small observable store for cross-component shared state:
 * cart, wishlist and user session. Components subscribe and re-render on change.
 *
 * Pattern: a minimal pub/sub. No framework. State is persisted to localStorage
 * via core/storage.js so it survives reloads, and mirrored to other open tabs
 * through the `storage` event.
 *
 * Public surface:
 *   state.getCart() / addToCart(product, qty) / updateQty(id, qty) / removeFromCart(id)
 *   state.getWishlist() / toggleWishlist(product) / isWishlisted(id)
 *   state.getUser() / setUser(u) / clearUser()
 *   state.cartCount() / cartSubtotal()          — the whole basket
 *   state.getSelectedCart() / selectedCount() / selectedSubtotal()
 *   state.setLineSelected(id, variant, on) / setAllSelected(on) / removeSelected()
 *   state.subscribe(event, handler) -> unsubscribe    (events below)
 */

import { storage, KEYS } from './storage.js';
import { track, productPayload } from './analytics.js';

export const EVENTS = {
  CART: 'cart:change',
  WISHLIST: 'wishlist:change',
  USER: 'user:change',
};

const listeners = { [EVENTS.CART]: new Set(), [EVENTS.WISHLIST]: new Set(), [EVENTS.USER]: new Set() };


let cart = storage.get(KEYS.CART, []);          // [{ id, title, brand, price, image, qty, variant, moq, selected }]
let wishlist = storage.get(KEYS.WISHLIST, []);  // [{ id, title, brand, price, image }]
let user = storage.get(KEYS.USER, null);        // { id, name, email } | null

function emit(event) {
  listeners[event]?.forEach((fn) => {
    try { fn(); } catch (err) { console.error('[state] listener error', err); }
  });
}

/* ---- Subscription ------------------------------------------------------ */
export function subscribe(event, handler) {
  listeners[event]?.add(handler);
  return () => listeners[event]?.delete(handler);
}

/* ---- Cart -------------------------------------------------------------- */
export function getCart() { return cart.slice(); }

/* Quantity bounds are PER LINE, because the catalogue is not all one kind of
   thing. A jar of honey is bought in ones; a tactile switch is bought in reels
   of 1,000 and its listed price only exists at that quantity. A single global
   1..99 clamp silently turned a 1,000-unit line into 99 — an order the B2B desk
   would have had to phone up and correct, at a unit price that does not apply. */
const RETAIL_MAX = 99;
function minQty(line) { return Math.max(1, Number(line?.moq) || 1); }
function maxQty(line) {
  const moq = Number(line?.moq) || 0;
  // 65,535 is all cart_items.qty can hold (unsignedSmallInteger), and the
  // server clamps there as well — a stepper that went higher would only earn a
  // 422 the customer can do nothing about.
  return moq ? Math.min(moq * 1000, 65535) : RETAIL_MAX;
}
function clampQty(line, qty) {
  const n = Number.isFinite(qty) ? qty : minQty(line);
  return Math.max(minQty(line), Math.min(maxQty(line), n));
}

export function addToCart(product, qty = 1) {
  const existing = cart.find((l) => l.id === product.id && l.variant === product.variant);
  if (existing) {
    existing.qty = clampQty(existing, existing.qty + qty);
    // Adding something is the plainest statement of intent to buy it there is,
    // so it comes back TICKED even if it was unticked earlier. The alternative
    // — pressing Add to Cart and watching the total not move — is the kind of
    // silence a shopper reads as a broken button.
    existing.selected = true;
  } else {
    const line = {
      id: product.id,
      title: product.title,
      brand: product.brand ?? '',
      price: product.price,
      image: product.image,
      variant: product.variant ?? null,
      // Carried on the line so the cart can enforce the minimum without having
      // to re-fetch the product. Absent on retail lines and on carts saved
      // before this existed, where minQty() falls back to 1.
      moq: product.moq ?? null,
      // Whether this line is going through checkout. See the selection block
      // below for why absence means "yes".
      selected: true,
      qty: 1,
    };
    line.qty = clampQty(line, qty);
    cart.push(line);
  }
  persistCart();

  // Fired here rather than at the buttons. Every route into the cart — the
  // PDP, a product card, quick view, the buy bar, a re-order — ends up in this
  // function, so this is the one place the event cannot be forgotten when a
  // seventh route is added.
  track('AddToCart', productPayload(product, qty));
}

export function updateQty(id, qty, variant = null) {
  const line = cart.find((l) => l.id === id && l.variant === variant);
  if (!line) return;
  line.qty = clampQty(line, qty);
  persistCart();
}

/** The step and bounds a UI should use for this line. */
export function qtyBounds(line) {
  return { min: minQty(line), max: maxQty(line), step: minQty(line) };
}

export function removeFromCart(id, variant = null) {
  cart = cart.filter((l) => !(l.id === id && l.variant === variant));
  persistCart();
}

export function clearCart() { cart = []; persistCart(); }

export function cartCount() { return cart.reduce((n, l) => n + l.qty, 0); }
export function cartSubtotal() { return cart.reduce((sum, l) => sum + l.price * l.qty, 0); }

function persistCart() { storage.set(KEYS.CART, cart); emit(EVENTS.CART); }

/* ---- Selection ---------------------------------------------------------
 *
 * WHICH LINES ARE ACTUALLY BEING BOUGHT RIGHT NOW.
 *
 * A basket in this market is half shopping list: three things wanted today and
 * two kept for payday. Before this existed the only way to buy the three was to
 * delete the two, so the list was lost every time an order was placed. A tick
 * per line is the smallest thing that fixes it — the untick keeps the line
 * where it is, and it is still there after checkout.
 *
 * ABSENCE MEANS TICKED, and everything here is written that way — `!== false`
 * rather than `=== true`. Two populations depend on it: every basket saved
 * before this release, and every line built by anything that constructs a cart
 * line without knowing about selection. Both must read as "buy this", because
 * a basket that silently checks out empty is far worse than one that checks out
 * whole, and "whole" is what the shop did yesterday.
 *
 * The cart badge and cartSubtotal() deliberately still count EVERYTHING. They
 * answer "what is in the basket", which is not the same question — a badge that
 * dropped to 1 when two lines were unticked would read as items having been
 * thrown away. What is being paid for is selectedSubtotal(), and that is what
 * the summary, the promo check and checkout use.
 */
export function isLineSelected(line) { return line?.selected !== false; }

export function getSelectedCart() { return cart.filter(isLineSelected); }

export function setLineSelected(id, variant = null, on = true) {
  const line = cart.find((l) => l.id === id && l.variant === variant);
  if (!line) return;
  line.selected = !!on;
  persistCart();
}

export function setAllSelected(on) {
  cart.forEach((l) => { l.selected = !!on; });
  persistCart();
}

export function selectedCount() { return cart.reduce((n, l) => n + (isLineSelected(l) ? l.qty : 0), 0); }
export function selectedSubtotal() { return cart.reduce((sum, l) => sum + (isLineSelected(l) ? l.price * l.qty : 0), 0); }

/**
 * What checkout calls once the order exists — NOT clearCart().
 *
 * Only what was bought leaves. An unticked line was deliberately held back, and
 * emptying the whole basket on a successful order would throw it away at the
 * one moment the customer is looking at a different page.
 */
export function removeSelected() { cart = cart.filter((l) => !isLineSelected(l)); persistCart(); }

/* ---- Wishlist ---------------------------------------------------------- */
export function getWishlist() { return wishlist.slice(); }
export function isWishlisted(id) { return wishlist.some((w) => w.id === id); }

export function toggleWishlist(product) {
  if (isWishlisted(product.id)) {
    wishlist = wishlist.filter((w) => w.id !== product.id);
  } else {
    wishlist.push({ id: product.id, title: product.title, brand: product.brand ?? '', price: product.price, image: product.image });
  }
  storage.set(KEYS.WISHLIST, wishlist);
  emit(EVENTS.WISHLIST);
  return isWishlisted(product.id);
}

export function removeFromWishlist(id) {
  wishlist = wishlist.filter((w) => w.id !== id);
  storage.set(KEYS.WISHLIST, wishlist);
  emit(EVENTS.WISHLIST);
}

export function wishlistCount() { return wishlist.length; }


/* ---- User session (mock) ---------------------------------------------- */
// TODO: backend — replace localStorage session with JWT-backed auth.
export function getUser() { return user; }
export function setUser(u) { user = u; storage.set(KEYS.USER, u); emit(EVENTS.USER); }
export function clearUser() { user = null; storage.remove(KEYS.USER); emit(EVENTS.USER); }
export function isLoggedIn() { return !!user; }

/* ---- Cross-tab sync ---------------------------------------------------- */
window.addEventListener('storage', (e) => {
  if (!e.key) return;
  if (e.key.endsWith(KEYS.CART))     { cart = storage.get(KEYS.CART, []); emit(EVENTS.CART); }
  if (e.key.endsWith(KEYS.WISHLIST)) { wishlist = storage.get(KEYS.WISHLIST, []); emit(EVENTS.WISHLIST); }
  if (e.key.endsWith(KEYS.USER))     { user = storage.get(KEYS.USER, null); emit(EVENTS.USER); }
});

// Convenience namespace for non-module consumers / debugging.
export const state = {
  getCart, addToCart, updateQty, removeFromCart, clearCart, cartCount, cartSubtotal,
  getSelectedCart, setLineSelected, setAllSelected, isLineSelected,
  selectedCount, selectedSubtotal, removeSelected,
  getWishlist, isWishlisted, toggleWishlist, removeFromWishlist, wishlistCount,
  getUser, setUser, clearUser, isLoggedIn, subscribe, EVENTS,
};
