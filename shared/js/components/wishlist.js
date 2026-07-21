/**
 * wishlist — enhances standalone wishlist toggle buttons (outside product cards,
 * e.g. on the product detail page). Cards handle their own heart via
 * product-card.js; this covers buttons that carry product data-attributes:
 *
 *   <button data-wishlist-toggle data-id="gr-1" data-title="…" data-brand="…"
 *           data-price="1200" data-image="…">Save</button>
 */

import * as store from '../core/state.js';
import { toast } from './toast-notifications.js';

export function initWishlistButtons(root = document) {
  root.querySelectorAll('[data-wishlist-toggle]').forEach((btn) => {
    if (btn.dataset.ready) return;
    btn.dataset.ready = 'true';
    const product = {
      id: btn.dataset.id,
      title: btn.dataset.title,
      brand: btn.dataset.brand,
      price: Number(btn.dataset.price),
      image: btn.dataset.image,
    };
    const paint = () => {
      const active = store.isWishlisted(product.id);
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
      const label = btn.querySelector('[data-wishlist-label]');
      if (label) label.textContent = active ? 'Saved' : 'Add to Wishlist';
    };
    paint();
    btn.addEventListener('click', () => {
      const active = store.toggleWishlist(product);
      paint();
      toast.info(active ? 'Saved to wishlist' : 'Removed from wishlist');
    });
    store.subscribe(store.EVENTS.WISHLIST, paint);
  });
}
