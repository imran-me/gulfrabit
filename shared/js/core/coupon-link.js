/**
 * coupon-link.js — an ad link that carries its own discount.
 *
 * The campaign model is: the ad says "use code GULF10", the click lands here.
 * Asking that visitor to remember and retype the code at checkout is a step
 * that only loses orders — so ?coupon=GULF10 (or ?promo=) on ANY entry URL
 * stores the code exactly where the cart page's own Apply button would have
 * put it, and the existing machinery takes over: the cart and express pages
 * re-validate on every paint, checkout sends it with the order, the server
 * remains the authority on what it is worth.
 *
 * Deliberately NOT validated here: validation needs a basket subtotal and at
 * landing there usually is no basket yet — a min-spend code would be refused
 * on arrival and then qualify ten minutes later. Store it, say so, let the
 * pages that know the basket decide.
 */

import { storage } from './storage.js';
import { toast } from '../components/toast-notifications.js';

export function initCouponLink() {
  const params = new URLSearchParams(location.search);
  const raw = params.get('coupon') || params.get('promo');
  if (!raw) return;

  const code = raw.trim().toUpperCase().slice(0, 24);
  if (!/^[A-Z0-9_-]{2,}$/.test(code)) return;

  const had = storage.get('cart-promo', null);
  storage.set('cart-promo', code);
  if (had !== code) {
    toast.info(`Coupon ${code} saved — your discount applies at checkout.`);
  }
}
