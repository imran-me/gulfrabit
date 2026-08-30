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
import { imageSource } from '../core/product-image.js';
import { formatBDT } from '../utils/format-currency.js';
import { trapFocus } from '../utils/focus-trap.js';

let root = null;         // the drawer container
let panel = null;        // the sliding panel
let unsub = null;
let releaseTrap = null;  // focus-trap release fn while open

const CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M18 6 6 18M6 6l12 12"/></svg>';
/* The bin replaces the word "Remove", which was a third link of body text in a
   line that already carries a title, a brand, a quantity stepper and a price.
   The word is not lost — it is the button's accessible name, and its tooltip. */
const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="18" height="18" aria-hidden="true"><path d="M4 7h16M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z"/><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M10 11v6M14 11v6"/></svg>';
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
        <a href="${siteURL('')}" class="btn-gr btn-outline-gr btn-sm-gr">Continue shopping</a>
      </div>`;
    footEl.innerHTML = '';
    return;
  }

  /* The tick decides what is bought; the bin decides what is kept. They are
     deliberately at opposite ends of the line, because one of them is
     reversible with a second click and the other is not. */
  const picked = cart.filter(store.isLineSelected).length;

  linesEl.innerHTML = `
    <label class="cart-pick-all">
      <input type="checkbox" class="cart-pick__box" data-pick-all
             ${picked === cart.length ? 'checked' : ''}
             ${picked && picked < cart.length ? 'data-some' : ''}>
      <span>Select all</span>
      <span class="cart-pick-all__count">${picked} of ${cart.length} selected</span>
    </label>` + cart.map((l) => `
    <div class="cart-line cart-line--pick" data-line-id="${l.id}" data-variant="${escapeAttr(l.variant ?? '')}">
      <label class="cart-pick">
        <input type="checkbox" class="cart-pick__box" data-pick ${store.isLineSelected(l) ? 'checked' : ''}>
        <span class="visually-hidden">Include ${escapeHtml(l.title)} in this order</span>
      </label>
      <picture>${imageSource(l.image, 'thumb')}
        <img class="cart-line__thumb" src="${escapeAttr(l.image)}" alt="${escapeAttr(l.title)}" loading="lazy">
      </picture>
      <div>
        <div class="cart-line__title">${escapeHtml(l.title)}</div>
        <div class="cart-line__meta">${l.variant ? `<strong>${escapeHtml(l.variant)}</strong> · ` : ''}${l.brand ? escapeHtml(l.brand) + ' · ' : ''}<!--
          --><span class="cart-line__qty">Qty
          <button class="cart-line__qty-dec" aria-label="Decrease quantity" style="background:none;border:0;color:inherit;cursor:pointer">−</button>
          <span class="tabular">${l.qty}</span>
          <button class="cart-line__qty-inc" aria-label="Increase quantity" style="background:none;border:0;color:inherit;cursor:pointer">+</button></span>
        </div>
      </div>
      <div class="cart-line__end">
        <div class="cart-line__price">${formatBDT(l.price * l.qty)}</div>
        <button class="cart-line__remove" data-remove type="button"
                title="Remove" aria-label="Remove ${escapeAttr(l.title)} from the cart">${TRASH}</button>
      </div>
    </div>`).join('');

  /* Neither ticked nor unticked: some lines are in and some are out, and the
     box says exactly that rather than claiming one of them. Set as a property
     because there is no HTML attribute for it. */
  const all = linesEl.querySelector('[data-pick-all]');
  all.indeterminate = all.hasAttribute('data-some');
  all.addEventListener('change', () => store.setAllSelected(all.checked));

  // Wire per-line controls.
  linesEl.querySelectorAll('.cart-line').forEach((row) => {
    const id = row.dataset.lineId;
    const variant = row.dataset.variant || null;
    const line = cart.find((l) => l.id === id && (l.variant ?? '') === (variant ?? ''));
    row.querySelector('.cart-line__qty-dec').addEventListener('click', () => store.updateQty(id, line.qty - 1, variant));
    row.querySelector('.cart-line__qty-inc').addEventListener('click', () => store.updateQty(id, line.qty + 1, variant));
    row.querySelector('[data-remove]').addEventListener('click', () => store.removeFromCart(id, variant));
    row.querySelector('[data-pick]').addEventListener('change', (e) => store.setLineSelected(id, variant, e.target.checked));
  });

  /* What is being paid for, not what is being held. store.cartSubtotal() is
     still the whole basket and is still what the badge counts — see the
     selection block in core/state.js for why the two answers are kept apart. */
  const subtotal = store.selectedSubtotal();
  const partial = picked > 0 && picked < cart.length;
  footEl.innerHTML = `
    <div class="gift-progress" data-gift-progress hidden></div>
    <div class="cart-summary-row">
      <span>Subtotal${partial ? ` <span class="cart-summary-row__note">${picked} of ${cart.length} items</span>` : ''}</span>
      <span class="tabular">${formatBDT(subtotal)}</span>
    </div>
    <div class="cart-summary-row"><span>Delivery</span><span>Calculated at checkout</span></div>
    <div class="flex gap-3 mt-4">
      <!-- Hidden, never removed, when the merchant switches it off in
           Appearance > Mini cart. The state lives in one attribute on <html>
           and the rule is in _modals-offcanvas.css, so there is no render here
           that can disagree with it. -->
      <a href="${siteURL('cart')}" class="btn-gr btn-outline-gr btn-block-gr" data-view-cart>View Cart</a>
      ${picked
        // A link cannot be disabled, and a Checkout that navigates to a page
        // reading "your cart is empty" is a worse answer than a button that
        // plainly cannot be pressed yet.
        ? `<a href="${siteURL('checkout')}" class="btn-gr btn-primary-gr btn-block-gr">Checkout</a>`
        : `<button type="button" class="btn-gr btn-primary-gr btn-block-gr" disabled>Checkout</button>`}
    </div>
    ${picked ? '' : '<p class="cart-drawer__hint">Tick an item to check it out. Nothing is removed by unticking.</p>'}`;

  // Not awaited: the drawer must open instantly. The gift block fills in a
  // beat later and is hidden until it has something to say.
  paintGift(subtotal);
}

export function openCartDrawer() {
  build();
  const bd = root.querySelector('.cart-drawer-backdrop');
  bd.hidden = false;
  requestAnimationFrame(() => { bd.style.opacity = '1'; panel.style.transform = 'translateX(0)'; });
  document.body.style.overflow = 'hidden';
  releaseTrap = trapFocus(panel);
}

export function closeCartDrawer() {
  if (!root) return;
  const bd = root.querySelector('.cart-drawer-backdrop');
  bd.style.opacity = '0';
  panel.style.transform = 'translateX(100%)';
  document.body.style.overflow = '';
  if (releaseTrap) { releaseTrap(); releaseTrap = null; }
  setTimeout(() => { bd.hidden = true; }, 300);
}

/** Initialise the drawer and bind any [data-open-cart] triggers (header icon). */
export function initCartDrawer() {
  /* Not in the staff panel. The admin screens load shared/js/main.js for the
     handful of utilities they share with the shop, and every init in it ran —
     so a shopping cart drawer, 359px of fixed overlay with a "Continue
     shopping" button in it, was being built into all twenty-two admin screens.
     Invisible until something opened it, and nothing there ever would, but it
     is the customer's furniture standing in the merchant's office. The tab bar
     twenty lines into mobile-tabbar.js already declines for the same reason. */
  if (document.querySelector('[data-admin-shell]')) return;

  build();
  document.querySelectorAll('[data-open-cart]').forEach((btn) =>
    btn.addEventListener('click', (e) => { e.preventDefault(); openCartDrawer(); }));
}

/**
 * The drawer ships on every page, so the gift module is imported lazily — only
 * once a basket actually has something in it. Failure is swallowed: a missing
 * reward must never break the cart itself.
 */
async function paintGift(subtotal) {
  const host = document.querySelector('.cart-drawer [data-gift-progress]');
  if (!host) return;
  try {
    const { renderGiftProgress } = await import('../../../modules/cart/gift-progress.js');
    await renderGiftProgress(host, subtotal);
  } catch {
    host.hidden = true;
  }
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
