/**
 * cart-page.js — glue for cart.html (the editable cart, source of truth).
 * Renders line items from shared state, supports qty edit / remove /
 * save-for-later, a promo code (mock), and a live order summary. Re-renders on
 * any cart change (incl. from the drawer or other tabs).
 */

import * as store from '../../shared/js/core/state.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { productURL, siteURL } from '../../shared/js/core/paths.js';
import { DEFAULT_OPTION } from '../delivery/backend/api.js';
import { validatePromo } from './backend/api.js';
import { renderGiftProgress } from './gift-progress.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { toast } from '../../shared/js/components/toast-notifications.js';


const itemsEl = document.querySelector('[data-cart-items]');
const emptyEl = document.querySelector('[data-cart-empty]');
const savedSection = document.querySelector('[data-saved-section]');
const savedEl = document.querySelector('[data-saved-items]');
const summaryEl = document.querySelector('[data-summary]');
const mobileCta = document.querySelector('[data-mobile-cta]');

// This key held a {code, type, value, label} object before 2026-07-26. A
// returning visitor still has that shape in localStorage, and passing it to
// validatePromo() would throw on code.trim() — so normalise it to the code.
const storedPromo = storage.get('cart-promo', null);
let promoCode = typeof storedPromo === 'string' ? storedPromo : (storedPromo?.code ?? null);
if (storedPromo && typeof storedPromo !== 'string') storage.set('cart-promo', promoCode);

store.subscribe(store.EVENTS.CART, render);
document.querySelector('[data-promo-apply]')?.addEventListener('click', applyPromo);
render();

async function render() {
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

  await paintSummary(cart);
}

function itemHTML(l) {
  return `
    <div class="cart-item" data-item="${l.id}" data-variant="${l.variant ?? ''}">
      <a class="cart-item__media" href="${productURL(l)}"><img src="${l.image}" alt="${escapeAttr(l.title)}" loading="lazy"></a>
      <div>
        <a href="${productURL(l)}"><div class="cart-item__title">${escapeHtml(l.title)}</div></a>
        <!-- The size leads. Two lines of the same product in different packs are
             otherwise identical on screen, and the customer cannot tell which
             one they are about to remove. -->
        <div class="cart-item__meta">${l.variant ? `<strong>${escapeHtml(l.variant)}</strong>${l.brand ? ' · ' : ''}` : ''}${l.brand ? escapeHtml(l.brand) : ''}</div>
        <div class="cart-item__controls">
          <div class="qty-stepper" data-qty>
            <button class="qty-stepper__btn" type="button" data-dec aria-label="Decrease">−</button>
            <input class="qty-stepper__input" data-qty-val value="${l.qty}" inputmode="numeric" aria-label="Quantity">
            <button class="qty-stepper__btn" type="button" data-inc aria-label="Increase">+</button>
          </div>
          ${l.moq ? `<span class="cart-item__moq">min ${Number(l.moq).toLocaleString('en-BD')} units</span>` : ''}
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
      <a class="cart-item__media" href="${productURL(s)}"><img src="${s.image}" alt="${escapeAttr(s.title)}" loading="lazy"></a>
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
    // Step by the line's own minimum. Industrial parts are sold in reels and
    // sacks, so ± on a 1,000-unit line moves by 1,000 — and store.updateQty
    // clamps to the same floor, so typing 1 into the box cannot get under it.
    const { step } = store.qtyBounds(line);
    row.querySelector('[data-dec]').addEventListener('click', () => store.updateQty(id, line.qty - step, variant));
    row.querySelector('[data-inc]').addEventListener('click', () => store.updateQty(id, line.qty + step, variant));
    row.querySelector('[data-qty-val]').addEventListener('change', (e) => store.updateQty(id, parseInt(e.target.value, 10) || step, variant));
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
  // variant travels with it, or Save for later on a 1 kg line moves a 500 g one
  // back into the cart when it returns.
  if (!saved.some((s) => s.id === line.id && (s.variant ?? null) === (line.variant ?? null))) {
    saved.push({ id: line.id, title: line.title, brand: line.brand, price: line.price, image: line.image, variant: line.variant ?? null });
  }
  storage.set(KEYS.SAVED_FOR_LATER, saved);
  store.removeFromCart(line.id, line.variant);
  toast.info('Saved for later');
}
function moveToCart(item) { dropSaved(item.id); store.addToCart(item, 1); toast.success('Moved to cart'); }
function dropSaved(id) { storage.set(KEYS.SAVED_FOR_LATER, storage.get(KEYS.SAVED_FOR_LATER, []).filter((s) => s.id !== id)); render(); }

/* ---- Promo + summary -------------------------------------------------- */
async function removePromo() {
  promoCode = null;
  storage.remove('cart-promo');
  const msg = document.querySelector('[data-promo-msg]');
  if (msg) { msg.style.color = ''; msg.textContent = 'Promo code removed.'; }
  const input = document.querySelector('[data-promo-input]');
  if (input) input.value = '';
  await paintSummary(store.getCart());
}

async function applyPromo() {
  const code = (document.querySelector('[data-promo-input]').value || '').trim().toUpperCase();
  const msg = document.querySelector('[data-promo-msg]');
  if (!code) return;

  const result = await validatePromo(code, store.cartSubtotal());

  if (result.valid) {
    promoCode = code;
    storage.set('cart-promo', code);
    msg.style.color = 'var(--lime-ink)';
    msg.textContent = `Applied ${result.label}.`;
  } else {
    msg.style.color = 'var(--gr-error)';
    // "Too small a basket" is actionable — say so instead of "invalid code",
    // which sends someone away who was one item from qualifying.
    msg.textContent = result.reason === 'min_subtotal'
      ? `Spend ${formatBDT(result.minSpend)} to use this code.`
      : 'That code isn’t valid.';
  }

  await paintSummary(store.getCart());
}

async function paintSummary(cart) {
  const subtotal = store.cartSubtotal();
  const count = store.cartCount();
  // Recomputed every render, never stored: if the basket drops below the
  // minimum spend the discount disappears on its own, exactly as the server does.
  const result = promoCode ? await validatePromo(promoCode, subtotal) : null;

  // A code that no longer qualifies is DROPPED, not merely hidden. Hiding the
  // row while leaving it in storage is how a customer ended up unable to order
  // at all: apply GULF10 at ৳1,200, remove an item to reach ৳800, and the cart
  // correctly stops showing the discount — but checkout still posted GULF10,
  // /cart/promo answered 422, and Place Order was refused with "Spend ৳1,000
  // to use this code" about a code shown nowhere and removable nowhere.
  if (result && !result.valid) {
    promoCode = null;
    storage.remove('cart-promo');
  }

  const discount = result?.valid ? result.discount : 0;
  const total = Math.max(0, subtotal - discount);

  setText('[data-summary-count]', count);
  setText('[data-summary-subtotal]', formatBDT(subtotal));
  setText('[data-summary-total]', formatBDT(total));
  setText('[data-mobile-total]', formatBDT(total));

  const discRow = document.querySelector('[data-summary-discount-row]');
  if (discount > 0) { discRow.hidden = false; setText('[data-summary-discount]', `−${formatBDT(discount)}`); setText('[data-summary-promo-code]', `(${promoCode})`); }
  else if (discRow) discRow.hidden = true;

  // Applied by mistake, or from a ?coupon= link the customer never chose —
  // there was no way to take one off short of clearing site data.
  const removeBtn = document.querySelector('[data-promo-remove]');
  if (removeBtn) removeBtn.hidden = discount <= 0;

  // Gift threshold. Awaited so the bar is in place before the summary is
  // considered painted — a bar that pops in after the total has settled reads
  // as a layout glitch.
  await renderGiftProgress(document.querySelector('[data-gift-progress]'), subtotal);

  // Quote the metro rate as an estimate; checkout resolves the real zone.
  const delivery = subtotal === 0 ? '—' : `from ${formatBDT(DEFAULT_OPTION.cost)}`;
  setText('[data-summary-delivery]', delivery);

  mobileCta.hidden = count === 0;
}

function setText(sel, val) { const el = document.querySelector(sel); if (el) el.textContent = val; }
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
