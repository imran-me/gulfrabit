/**
 * wishlist-page.js — grid of saved products with move-to-cart (via the shared
 * product card). Re-renders live as items are added/removed.
 */
import * as store from '../../shared/js/core/state.js';
import { renderProductGrid } from '../../shared/js/components/product-card.js';
import { ensureSession, wireLogout } from './account-common.js';

ensureSession();
wireLogout();

const grid = document.querySelector('[data-wishlist-grid]');
const emptyEl = document.querySelector('[data-wishlist-empty]');

store.subscribe(store.EVENTS.WISHLIST, render);
render();

function render() {
  const items = store.getWishlist();
  if (!items.length) { grid.innerHTML = ''; emptyEl.hidden = false; return; }
  emptyEl.hidden = true;
  // Wishlist entries are lightweight; fill card defaults so it renders fully.
  renderProductGrid(grid, items.map((w) => ({ ...w, inStock: true, rating: 0, reviewCount: 0, tags: [] })));
}
