/**
 * cart-page.js — glue for cart.html (the editable cart, source of truth).
 * Renders line items from shared state, supports qty edit / remove /
 * save-for-later, a promo code (mock), and a live order summary. Re-renders on
 * any cart change (incl. from the drawer or other tabs).
 */

import * as store from '../../shared/js/core/state.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { siteURL } from '../../shared/js/core/paths.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { toast } from '../../shared/js/components/toast-notifications.js';

// Mock promo codes. // TODO: backend — validate server-side via /cart/promo.
const PROMOS = { GULF10: { type: 'pct', value: 10, label: '10% off' }, HOP500: { type: 'flat', value: 500, label: '৳500 off' } };

const itemsEl = document.querySelector('[data-cart-items]');
const emptyEl = document.querySelector('[data-cart-empty]');
const savedSection = document.querySelector('[data-saved-section]');
const savedEl = document.querySelector('[data-saved-items]');
const summaryEl = document.querySelector('[data-summary]');
const mobileCta = document.querySelector('[data-mobile-cta]');

let promo = storage.get('cart-promo', null);

store.subscribe(store.EVENTS.CART, render);
document.querySelector('[data-promo-apply]')?.addEventListener('click', applyPromo);
render();

function render() {
  const cart = store.getCart();
  const saved = storage.get(KEYS.SAVED_FOR_LATER, []);

  // Empty state
  if (!cart.length) {
    itemsEl.innerHTML = '';
    emptyEl.hidden = false;
    summaryEl.style.display = 'none';
    mobileCta.hidden = true;
  } else {
    emptyEl.hidden = true;
    summaryEl.style.display = '';
    itemsEl.innerHTML = cart.map(itemHTML).join('');
    wireItems(cart);
  }

  // Saved-for-later
  if (saved.length) {
    savedSection.hidden = false;
    savedEl.innerHTML = saved.map((s) => savedHTML(s)).join('');
    wireSaved(saved);
  } else {
    savedSection.hidden = true;
  }

  paintSummary(cart);
}

function itemHTML(l) {
  return `
    <div class="cart-item" data-item="${l.id}" data-variant="${l.variant ?? ''}">
      <a class="cart-item__media" href="${siteURL(`modules/catalog/product.html?id=${l.id}`)}"><img src="${l.image}" alt="${escapeAttr(l.title)}" loading="lazy"></a>
      <div>
        <a href="${siteURL(`modules/catalog/product.html?id=${l.id}`)}"><div class="cart-item__title">${escapeHtml(l.title)}</div></a>
        <div class="cart-item__meta">${l.brand ? escapeHtml(l.brand) : ''}</div>
        <div class="cart-item__controls">
          <div class="qty-stepper" data-qty>
            <button class="qty-stepper__btn" type="button" data-dec aria-label="Decrease">−</button>
            <input class="qty-stepper__input" data-qty-val value="${l.qty}" inputmode="numeric" aria-label="Quantity">
            <button class="qty-stepper__btn" type="button" data-inc aria-label="Increase">+</button>
          </div>
          <button class="cart-item__link" data-save>Save for later</button>
          <button class="cart-item__link cart-item__link--danger" data-remove>Remove</button>
        </div>
      </div>
      <div class="cart-item__price">${formatBDT(l.price * l.qty)}</div>
    </div>`;
}

function savedHTML(s) {
  return `
    <div class="cart-item" data-saved="${s.id}">
      <a class="cart-item__media" href="${siteURL(`modules/catalog/product.html?id=${s.id}`)}"><img src="${s.image}" alt="${escapeAttr(s.title)}" loading="lazy"></a>
      <div>
        <div class="cart-item__title">${escapeHtml(s.title)}</div>
        <div class="cart-item__meta">${escapeHtml(s.brand || '')}</div>
        <div class="cart-item__controls">
          <button class="cart-item__link" data-move>Move to cart</button>
          <button class="cart-item__link cart-item__link--danger" data-drop>Remove</button>
        </div>
      </div>
      <div class="cart-item__price">${formatBDT(s.price)}</div>
    </div>`;
}

function wireItems(cart) {
  itemsEl.querySelectorAll('[data-item]').forEach((row) => {
    const id = row.dataset.item;
    const variant = row.dataset.variant || null;
    const line = cart.find((l) => l.id === id && (l.variant ?? '') === (variant ?? ''));
    row.querySelector('[data-dec]').addEventListener('click', () => store.updateQty(id, line.qty - 1, variant));
    row.querySelector('[data-inc]').addEventListener('click', () => store.updateQty(id, line.qty + 1, variant));
    row.querySelector('[data-qty-val]').addEventListener('change', (e) => store.updateQty(id, parseInt(e.target.value, 10) || 1, variant));
    row.querySelector('[data-remove]').addEventListener('click', () => { store.removeFromCart(id, variant); toast.info('Removed from cart'); });
    row.querySelector('[data-save]').addEventListener('click', () => saveForLater(line));
  });
}

function wireSaved(saved) {
  savedEl.querySelectorAll('[data-saved]').forEach((row) => {
    const id = row.dataset.saved;
    const item = saved.find((s) => s.id === id);
    row.querySelector('[data-move]').addEventListener('click', () => moveToCart(item));
    row.querySelector('[data-drop]').addEventListener('click', () => { dropSaved(id); toast.info('Removed'); });
  });
}

function saveForLater(line) {
  const saved = storage.get(KEYS.SAVED_FOR_LATER, []);
  if (!saved.some((s) => s.id === line.id)) saved.push({ id: line.id, title: line.title, brand: line.brand, price: line.price, image: line.image });
  storage.set(KEYS.SAVED_FOR_LATER, saved);
  store.removeFromCart(line.id, line.variant);
  toast.info('Saved for later');
}
function moveToCart(item) { dropSaved(item.id); store.addToCart(item, 1); toast.success('Moved to cart'); }
function dropSaved(id) { storage.set(KEYS.SAVED_FOR_LATER, storage.get(KEYS.SAVED_FOR_LATER, []).filter((s) => s.id !== id)); render(); }

/* ---- Promo + summary -------------------------------------------------- */
function applyPromo() {
  const code = (document.querySelector('[data-promo-input]').value || '').trim().toUpperCase();
  const msg = document.querySelector('[data-promo-msg]');
  if (!code) return;
  if (PROMOS[code]) {
    promo = { code, ...PROMOS[code] };
    storage.set('cart-promo', promo);
    msg.style.color = 'var(--gr-lime)';
    msg.textContent = `Applied ${PROMOS[code].label}.`;
    paintSummary(store.getCart());
  } else {
    msg.style.color = 'var(--gr-error)';
    msg.textContent = 'That code isn’t valid.';
  }
}

function discountFor(subtotal) {
  if (!promo) return 0;
  return promo.type === 'pct' ? Math.round(subtotal * (promo.value / 100)) : Math.min(promo.value, subtotal);
}

function paintSummary(cart) {
  const subtotal = store.cartSubtotal();
  const count = store.cartCount();
  const discount = discountFor(subtotal);
  const total = Math.max(0, subtotal - discount);

  setText('[data-summary-count]', count);
  setText('[data-summary-subtotal]', formatBDT(subtotal));
  setText('[data-summary-total]', formatBDT(total));
  setText('[data-mobile-total]', formatBDT(total));

  const discRow = document.querySelector('[data-summary-discount-row]');
  if (discount > 0) { discRow.hidden = false; setText('[data-summary-discount]', `−${formatBDT(discount)}`); setText('[data-summary-promo-code]', `(${promo.code})`); }
  else if (discRow) discRow.hidden = true;

  const delivery = subtotal >= 3000 || subtotal === 0 ? 'Free in Dhaka' : '৳ 60 (est.)';
  setText('[data-summary-delivery]', delivery);

  mobileCta.hidden = count === 0;
}

function setText(sel, val) { const el = document.querySelector(sel); if (el) el.textContent = val; }
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
