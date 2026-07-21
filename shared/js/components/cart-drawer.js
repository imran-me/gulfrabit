/**
 * cart-drawer — the slide-in mini cart (offcanvas from the right).
 *
 * Self-contained: injects its own markup once, subscribes to the shared cart
 * state, and re-renders live on any change. Opens on "Add to Cart" and from the
 * header cart icon. Works on every page without per-page markup.
 *
 * The full cart page (modules/cart/) is the editable source of truth; this
 * drawer is the quick glance + fast path to checkout.
 */

import * as store from '../core/state.js';
import { siteURL } from '../core/paths.js';
import { formatBDT } from '../utils/format-currency.js';

let root = null;         // the drawer container
let panel = null;        // the sliding panel
let unsub = null;

const CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const BAG   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="56" height="56"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>';

function build() {
  if (root) return;
  root = document.createElement('div');
  root.className = 'cart-drawer-root';
  root.innerHTML = `
    <div class="cart-drawer-backdrop" data-close hidden></div>
    <aside class="cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping cart" tabindex="-1"
           style="position:fixed;top:0;right:0;height:100%;display:flex;flex-direction:column;z-index:var(--z-drawer);transform:translateX(100%);transition:transform var(--dur-slow) var(--ease-out)">
      <header class="cart-drawer__header">
        <span class="cart-drawer__title">Your Cart <span data-cart-title-count class="text-muted-gr"></span></span>
        <button class="btn-icon-gr" data-close aria-label="Close cart">${CLOSE}</button>
      </header>
      <div class="cart-drawer__body" data-cart-lines></div>
      <footer class="cart-drawer__footer" data-cart-footer></footer>
    </aside>`;
  // Backdrop styling (kept inline so the drawer is fully self-contained).
  const bd = root.querySelector('.cart-drawer-backdrop');
  Object.assign(bd.style, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,.6)',
    backdropFilter: 'blur(2px)', webkitBackdropFilter: 'blur(2px)',
    zIndex: 'var(--z-drawer)', opacity: '0', transition: 'opacity var(--dur-slow) var(--ease-out)',
  });
  document.body.appendChild(root);
  panel = root.querySelector('.cart-drawer');

  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeCartDrawer));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCartDrawer(); });

  unsub = store.subscribe(store.EVENTS.CART, render);
  render();
}

function render() {
  if (!root) return;
  const cart = store.getCart();
  const linesEl = root.querySelector('[data-cart-lines]');
  const footEl = root.querySelector('[data-cart-footer]');
  const countEl = root.querySelector('[data-cart-title-count]');
  countEl.textContent = cart.length ? `(${store.cartCount()})` : '';

  if (!cart.length) {
    linesEl.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty__icon">${BAG}</div>
        <p class="h5" style="margin-bottom:.5rem">Your cart is empty</p>
        <p class="caption" style="margin-bottom:1.5rem">Sourced. Verified. Delivered — start exploring.</p>
        <a href="${siteURL('index.html')}" class="btn-gr btn-outline-gr btn-sm-gr">Continue shopping</a>
      </div>`;
    footEl.innerHTML = '';
    return;
  }

  linesEl.innerHTML = cart.map((l) => `
    <div class="cart-line" data-line-id="${l.id}" data-variant="${l.variant ?? ''}">
      <img class="cart-line__thumb" src="${l.image}" alt="${escapeAttr(l.title)}" loading="lazy">
      <div>
        <div class="cart-line__title">${escapeHtml(l.title)}</div>
        <div class="cart-line__meta">${l.brand ? escapeHtml(l.brand) + ' · ' : ''}Qty
          <button class="cart-line__qty-dec" aria-label="Decrease quantity" style="background:none;border:0;color:inherit;cursor:pointer">−</button>
          <span class="tabular">${l.qty}</span>
          <button class="cart-line__qty-inc" aria-label="Increase quantity" style="background:none;border:0;color:inherit;cursor:pointer">+</button>
        </div>
        <button class="cart-line__remove" data-remove>Remove</button>
      </div>
      <div class="cart-line__price">${formatBDT(l.price * l.qty)}</div>
    </div>`).join('');

  // Wire per-line controls.
  linesEl.querySelectorAll('.cart-line').forEach((row) => {
    const id = row.dataset.lineId;
    const variant = row.dataset.variant || null;
    const line = cart.find((l) => l.id === id && (l.variant ?? '') === (variant ?? ''));
    row.querySelector('.cart-line__qty-dec').addEventListener('click', () => store.updateQty(id, line.qty - 1, variant));
    row.querySelector('.cart-line__qty-inc').addEventListener('click', () => store.updateQty(id, line.qty + 1, variant));
    row.querySelector('[data-remove]').addEventListener('click', () => store.removeFromCart(id, variant));
  });

  const subtotal = store.cartSubtotal();
  footEl.innerHTML = `
    <div class="cart-summary-row"><span>Subtotal</span><span class="tabular">${formatBDT(subtotal)}</span></div>
    <div class="cart-summary-row"><span>Delivery</span><span>Calculated at checkout</span></div>
    <div style="display:flex;gap:.75rem;margin-top:1rem">
      <a href="${siteURL('modules/cart/cart.html')}" class="btn-gr btn-outline-gr btn-block-gr">View Cart</a>
      <a href="${siteURL('modules/checkout/checkout.html')}" class="btn-gr btn-primary-gr btn-block-gr">Checkout</a>
    </div>`;
}

export function openCartDrawer() {
  build();
  const bd = root.querySelector('.cart-drawer-backdrop');
  bd.hidden = false;
  requestAnimationFrame(() => { bd.style.opacity = '1'; panel.style.transform = 'translateX(0)'; });
  document.body.style.overflow = 'hidden';
  panel.focus();
}

export function closeCartDrawer() {
  if (!root) return;
  const bd = root.querySelector('.cart-drawer-backdrop');
  bd.style.opacity = '0';
  panel.style.transform = 'translateX(100%)';
  document.body.style.overflow = '';
  setTimeout(() => { bd.hidden = true; }, 300);
}

/** Initialise the drawer and bind any [data-open-cart] triggers (header icon). */
export function initCartDrawer() {
  build();
  document.querySelectorAll('[data-open-cart]').forEach((btn) =>
    btn.addEventListener('click', (e) => { e.preventDefault(); openCartDrawer(); }));
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
