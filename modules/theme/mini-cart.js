/**
 * mini-cart.js — which controls the slide-in mini cart shows.
 *
 * Same shape as card-parts.js beside it, and for the same reasons; read that
 * file for the long version. What differs is only where the answer is used:
 * the drawer's footer, once it is open.
 *
 * THE ANSWER IS A BOOLEAN, so the attribute lists only what is switched OFF:
 *
 *     <html data-mini-cart="view-cart:off">
 *
 * Absence therefore means "shown", which is the drawer this repository draws,
 * which is what every page renders with no JavaScript and no backend. There is
 * no state in which the button vanishes because something failed.
 *
 * NOTHING RE-RENDERS ON THIS. The hiding is one rule in
 * shared/css/partials/_modals-offcanvas.css keyed off the attribute, so the
 * drawer does not have to know this file exists, cannot render a footer that
 * disagrees with it, and does not have to be rebuilt when the answer arrives
 * mid-visit. The button also stays in the markup — a merchant's preference
 * hides a control, it does not delete one.
 */

const MIRROR_KEY = 'gr:mini-cart';

/** Keep in step with Modules\Theme\Models\MiniCart::PARTS. */
export const PARTS = ['view_cart'];

/* The attribute spells its tokens the way HTML does. One map rather than a
   .replace(): a part named `b2b_price` would otherwise become `b2b-price`
   here and `b2b_price` in PHP, and only one of them would be right. */
const TOKEN = { view_cart: 'view-cart' };

/** Anything → a complete, valid answer. Mirrors normalise() in PHP. */
export function normalise(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const part of PARTS) out[part] = typeof src[part] === 'boolean' ? src[part] : true;
  return out;
}

/** The tokens for what is hidden, as the attribute wants them. */
export function tokens(cart) {
  return PARTS.filter((part) => !cart[part]).map((part) => `${TOKEN[part]}:off`).join(' ');
}

export function stamp(cart) {
  const value = tokens(cart);
  const root = document.documentElement;
  // Removed rather than left empty: `[data-mini-cart]` with nothing in it is a
  // drawer with every control shown, and so is no attribute at all. One of
  // those two states is enough.
  if (value) root.setAttribute('data-mini-cart', value);
  else root.removeAttribute('data-mini-cart');
}

/** Is this control in the drawer right now? */
export function shows(part) {
  return !(document.documentElement.getAttribute('data-mini-cart') || '')
    .split(' ')
    .includes(`${TOKEN[part]}:off`);
}

export function readMirror() {
  try {
    return JSON.parse(localStorage.getItem(MIRROR_KEY) || 'null');
  } catch {
    return null;
  }
}

/* Written only after a successful server READ, so the mirror can only ever be
   a copy of what the world is seeing. The panel deliberately does not write it
   — see theme-page.js for the bug that rule exists to prevent. */
export function writeMirror(cart) {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(cart));
  } catch { /* private mode, or storage full. The page is already correct. */ }
}

/**
 * Stamp the last answer the server gave, before asking it again.
 *
 * Unlike the card parts this is NOT done by the pre-paint bootstrap, because
 * nothing it governs is on screen at first paint — the drawer is built empty
 * and only opens on a click. What it does have to beat is that click, which is
 * why it runs at the top of syncTheme() rather than waiting for the fetch: a
 * visitor who opens the cart before the network answers sees the footer the
 * shop published, not the one in the repository followed by a flicker.
 */
export function applyMirror() {
  stamp(normalise(readMirror()));
}

/** Apply an answer. There is nothing to re-listen for — it is not per-device. */
export function applyMiniCart(cart) {
  stamp(cart);
}
