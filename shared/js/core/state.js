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
 *   state.cartCount() / cartSubtotal()
 *   state.subscribe(event, handler) -> unsubscribe    (events below)
 */

import { storage, KEYS } from './storage.js';

export const EVENTS = {
  CART: 'cart:change',
  WISHLIST: 'wishlist:change',
  COMPARE: 'compare:change',
  USER: 'user:change',
};

const listeners = { [EVENTS.CART]: new Set(), [EVENTS.WISHLIST]: new Set(), [EVENTS.COMPARE]: new Set(), [EVENTS.USER]: new Set() };

export const COMPARE_MAX = 4;

let cart = storage.get(KEYS.CART, []);          // [{ id, title, brand, price, image, qty, variant }]
let wishlist = storage.get(KEYS.WISHLIST, []);  // [{ id, title, brand, price, image }]
let compare = storage.get(KEYS.COMPARE, []);    // [productId] — compare selection
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

export function addToCart(product, qty = 1) {
  const existing = cart.find((l) => l.id === product.id && l.variant === product.variant);
  if (existing) {
    existing.qty = Math.min(existing.qty + qty, 99);
  } else {
    cart.push({
      id: product.id,
      title: product.title,
      brand: product.brand ?? '',
      price: product.price,
      image: product.image,
      variant: product.variant ?? null,
      qty: Math.min(qty, 99),
    });
  }
  persistCart();
}

export function updateQty(id, qty, variant = null) {
  const line = cart.find((l) => l.id === id && l.variant === variant);
  if (!line) return;
  line.qty = Math.max(1, Math.min(qty, 99));
  persistCart();
}

export function removeFromCart(id, variant = null) {
  cart = cart.filter((l) => !(l.id === id && l.variant === variant));
  persistCart();
}

export function clearCart() { cart = []; persistCart(); }

export function cartCount() { return cart.reduce((n, l) => n + l.qty, 0); }
export function cartSubtotal() { return cart.reduce((sum, l) => sum + l.price * l.qty, 0); }

function persistCart() { storage.set(KEYS.CART, cart); emit(EVENTS.CART); }

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

/* ---- Compare ----------------------------------------------------------- */
export function getCompare() { return compare.slice(); }
export function isInCompare(id) { return compare.includes(id); }
export function compareCount() { return compare.length; }

/** Toggle a product id in the compare set (capped at COMPARE_MAX).
 *  Returns { active, full } — full=true means it was rejected for being at cap. */
export function toggleCompare(id) {
  if (compare.includes(id)) {
    compare = compare.filter((x) => x !== id);
    persistCompare();
    return { active: false, full: false };
  }
  if (compare.length >= COMPARE_MAX) return { active: false, full: true };
  compare.push(id);
  persistCompare();
  return { active: true, full: false };
}
export function removeFromCompare(id) { compare = compare.filter((x) => x !== id); persistCompare(); }
export function clearCompare() { compare = []; persistCompare(); }
function persistCompare() { storage.set(KEYS.COMPARE, compare); emit(EVENTS.COMPARE); }

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
  if (e.key.endsWith(KEYS.COMPARE))  { compare = storage.get(KEYS.COMPARE, []); emit(EVENTS.COMPARE); }
  if (e.key.endsWith(KEYS.USER))     { user = storage.get(KEYS.USER, null); emit(EVENTS.USER); }
});

// Convenience namespace for non-module consumers / debugging.
export const state = {
  getCart, addToCart, updateQty, removeFromCart, clearCart, cartCount, cartSubtotal,
  getWishlist, isWishlisted, toggleWishlist, removeFromWishlist, wishlistCount,
  getCompare, isInCompare, toggleCompare, removeFromCompare, clearCompare, compareCount, COMPARE_MAX,
  getUser, setUser, clearUser, isLoggedIn, subscribe, EVENTS,
};
