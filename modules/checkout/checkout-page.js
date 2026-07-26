/**
 * checkout-page.js — multi-step checkout (Address → Delivery → Payment → Review).
 * Client-side only: real validation (utils/validate-form.js), live summary, and
 * a mock "place order" that writes an order to localStorage and routes to the
 * confirmation page. NO real payment is processed.
 *
 * // TODO: connect to payment gateway  (see modules/checkout/backend/endpoints.md)
 */

import * as store from '../../shared/js/core/state.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { siteURL } from '../../shared/js/core/paths.js';
import { DEFAULT_OPTION, getDistrictsByDivision, quoteForDistrict } from '../delivery/backend/api.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { validateForm, validateField, attachLiveValidation } from '../../shared/js/utils/validate-form.js';
import { toast } from '../../shared/js/components/toast-notifications.js';

const form = document.querySelector('[data-checkout-form]');
const steps = [...document.querySelectorAll('.checkout-step')];
const indicators = [...document.querySelectorAll('[data-step-indicator]')];
let current = 1;
// Default to the metro rate; the radios (and later the district) refine it.
let deliveryCost = DEFAULT_OPTION.cost;

init();

async function init() {
  // Guard: empty cart → back to cart.
  if (!store.getCart().length) {
    document.querySelector('.checkout-layout').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1"><h2 class="empty-state__title">Your cart is empty</h2><p class="empty-state__text">Add something before checking out.</p><a class="btn-gr btn-primary-gr" href="${siteURL('index.html')}">Start shopping</a></div>`;
    document.querySelector('[data-stepper]')?.remove();
    return;
  }

  attachLiveValidation(form);
  prefillFromUser();
  wireNav();
  wireDelivery();
  wireDistricts();
  wirePayment();
  paintSummary();
  form.addEventListener('submit', placeOrder);
}

/* ---- Step navigation -------------------------------------------------- */
function wireNav() {
  form.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', next));
  form.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', prev));
}
function showStep(n) {
  current = n;
  steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
  indicators.forEach((ind) => {
    const i = Number(ind.dataset.stepIndicator);
    ind.classList.toggle('is-active', i === n);
    ind.classList.toggle('is-done', i < n);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (n === 4) paintReview();
}
function next() {
  // Validate step 1 (address) before advancing.
  if (current === 1) {
    const { valid } = validateForm(form);
    // Only address fields are in step 1; validateForm checks all [data-validate].
    // Card fields are hidden unless card is chosen — hidden inputs still validate
    // only if visible, so guard here:
    if (!valid && anyVisibleInvalid()) { toast.error('Please complete the required fields.'); return; }
  }
  // Validate card details while the payment step (and its fields) are visible.
  if (current === 3 && form.querySelector('[data-payment]:checked')?.value === 'card') {
    const ok = ['cardNum', 'cardExp', 'cardCvc'].every((n) => validateField(form.querySelector(`[name="${n}"]`), form));
    if (!ok) { toast.error('Please complete your card details.'); return; }
  }
  if (current < 4) showStep(current + 1);
}
function prev() { if (current > 1) showStep(current - 1); }

function anyVisibleInvalid() {
  return [...form.querySelectorAll('.field-gr.is-invalid')].some((f) => f.offsetParent !== null);
}

/* ---- Prefill from mock user ------------------------------------------ */
function prefillFromUser() {
  const user = store.getUser();
  if (!user) return;
  setVal('fullName', user.name);
  setVal('phone', user.phone);
  const def = (user.addresses || []).find((a) => a.isDefault);
  if (def) { setVal('address', def.line1); setVal('area', def.city); }
}
function setVal(name, v) { const el = form.querySelector(`[name="${name}"]`); if (el && v) el.value = v; }

/* ---- District drives the delivery zone --------------------------------
   The customer tells us where they are; working out which tier that falls in
   is our job, not theirs. Ghorer Bazar and Daraz both resolve the charge from
   the address rather than asking the buyer to self-select a zone.
   The radios stay in the markup as the no-JS fallback; here we resolve the
   right one and take the impossible ones out of play. ---------------------- */
async function wireDistricts() {
  const select = form.querySelector('[data-district]');
  if (!select) return;

  let byDivision;
  try {
    byDivision = await getDistrictsByDivision();
  } catch {
    // Leave the zone radios fully selectable — a failed district lookup must
    // not block checkout, it just costs us the automatic resolution.
    return;
  }

  for (const [division, districts] of Object.entries(byDivision)) {
    const group = document.createElement('optgroup');
    group.label = division;
    for (const d of districts) {
      const opt = document.createElement('option');
      opt.value = d.key;
      opt.textContent = d.name;
      group.appendChild(opt);
    }
    select.appendChild(group);
  }

  // Restore a saved district before wiring, so the zone resolves on load.
  const saved = storage.get('checkout-district', '');
  if (saved && select.querySelector(`option[value="${saved}"]`)) select.value = saved;

  select.addEventListener('change', () => applyDistrict(select.value));
  if (select.value) applyDistrict(select.value);
}

async function applyDistrict(districtKey) {
  const note = form.querySelector('[data-delivery-resolved]');
  const quote = districtKey ? await quoteForDistrict(districtKey) : null;

  if (!quote) {
    // Unknown district: unlock everything rather than guessing a zone. Quoting
    // the cheaper tier on an unserviceable address would undercharge us.
    form.querySelectorAll('[data-delivery]').forEach((r) => { r.disabled = false; });
    if (note) note.hidden = true;
    return;
  }

  storage.set('checkout-district', districtKey);

  // Express is a genuine upgrade, but only where we run our own last mile.
  const expressAllowed = districtKey === 'dhaka';

  form.querySelectorAll('[data-delivery]').forEach((radio) => {
    const isResolved = radio.value === quote.id;
    const isExpress = radio.value === 'express';
    radio.disabled = !(isResolved || (isExpress && expressAllowed));
    radio.closest('.option-card')?.classList.toggle('is-unavailable', radio.disabled);
    if (isResolved) radio.checked = true;
  });

  syncDeliverySelection();

  if (note) {
    const name = form.querySelector('[data-district]')?.selectedOptions[0]?.textContent || '';
    note.hidden = false;
    note.innerHTML = `Delivering to <strong>${escapeHtml(name)}</strong> — ${escapeHtml(quote.label)}, ${escapeHtml(quote.eta)}.`;
  }
}

/** Mirror the checked radio into cost + card state, then repaint totals. */
function syncDeliverySelection() {
  const checked = form.querySelector('[data-delivery]:checked');
  if (checked) deliveryCost = Number(checked.dataset.cost);
  form.querySelectorAll('[data-delivery]').forEach((x) =>
    x.closest('.option-card')?.classList.toggle('is-selected', x.checked));
  paintSummary();
}

/* ---- Delivery + payment ---------------------------------------------- */
function wireDelivery() {
  form.querySelectorAll('[data-delivery]').forEach((r) =>
    r.addEventListener('change', syncDeliverySelection));
}
function wirePayment() {
  const cardFields = form.querySelector('[data-card-fields]');
  // Card fields are only validated while "Card" is the chosen method.
  const setCardRequired = (on) => {
    const rules = { cardNum: 'required|numeric|min:12', cardExp: 'required', cardCvc: 'required|numeric|min:3' };
    Object.entries(rules).forEach(([name, rule]) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (!el) return;
      if (on) el.setAttribute('data-validate', rule);
      else { el.removeAttribute('data-validate'); el.closest('[data-field]')?.classList.remove('is-invalid'); }
    });
  };
  form.querySelectorAll('[data-payment]').forEach((r) => r.addEventListener('change', () => {
    form.querySelectorAll('[data-payment]').forEach((x) => x.closest('.option-card').classList.toggle('is-selected', x.checked));
    const isCard = form.querySelector('[data-payment]:checked')?.value === 'card';
    cardFields.hidden = !isCard;
    setCardRequired(isCard);
  }));
}

/* ---- Summary + review ------------------------------------------------- */
function subtotal() { return store.cartSubtotal(); }
function total() { return subtotal() + deliveryCost; }

function paintSummary() {
  const cart = store.getCart();
  document.querySelector('[data-summary-items]').innerHTML = cart.map((l) => `
    <div class="cart-line" style="grid-template-columns:48px 1fr auto">
      <img class="cart-line__thumb" style="width:48px;height:48px" src="${l.image}" alt=""><div><div class="cart-line__title">${escapeHtml(l.title)}</div><div class="cart-line__meta">Qty ${l.qty}</div></div>
      <div class="cart-line__price">${formatBDT(l.price * l.qty)}</div>
    </div>`).join('');
  setText('[data-sum-subtotal]', formatBDT(subtotal()));
  setText('[data-sum-delivery]', formatBDT(deliveryCost));
  setText('[data-sum-total]', formatBDT(total()));
}

function paintReview() {
  const g = (n) => form.querySelector(`[name="${n}"]`)?.value || '';
  const districtName = form.querySelector('[data-district]')?.selectedOptions[0]?.textContent || '';
  setText('[data-review-address]', [g('fullName'), g('address'), g('area'), districtName, g('phone')].filter(Boolean).join(', '));
  setText('[data-review-delivery]', form.querySelector('[data-delivery]:checked')?.closest('.option-card').querySelector('.option-card__title').textContent || '');
  setText('[data-review-payment]', form.querySelector('[data-payment]:checked')?.closest('.option-card').querySelector('.option-card__title').textContent || '');
  document.querySelector('[data-review-items]').innerHTML = store.getCart().map((l) =>
    `<div class="review-line"><span>${l.qty} × ${escapeHtml(l.title)}</span><span class="tabular">${formatBDT(l.price * l.qty)}</span></div>`).join('')
    + `<div class="review-line" style="border:0;font-weight:600"><span>Total</span><span class="tabular">${formatBDT(total())}</span></div>`;
}

/* ---- Place order (mock) ---------------------------------------------- */
function placeOrder(e) {
  e.preventDefault();
  const { valid } = validateForm(form);
  if (!valid && anyVisibleInvalid()) { showStep(1); toast.error('Please complete your address.'); return; }

  const g = (n) => form.querySelector(`[name="${n}"]`)?.value || '';
  const cart = store.getCart();
  const orderId = 'GR-2026-' + Math.floor(1000 + performance.now() % 9000);
  const order = {
    id: orderId,
    date: new Date().toISOString().slice(0, 10),
    status: 'processing',
    total: total(),
    items: cart.map((l) => ({ id: l.id, title: l.title, qty: l.qty, price: l.price, image: l.image })),
    address: [g('address'), g('area'), form.querySelector('[data-district]')?.selectedOptions[0]?.textContent]
      .filter(Boolean).join(', '),
    phone: g('phone'),
    email: g('email') || null,
    delivery: form.querySelector('[data-delivery]:checked')?.value,
    payment: form.querySelector('[data-payment]:checked')?.value,
  };

  // Persist to the user's local order history + stash "last order" for confirmation.
  const orders = storage.get(KEYS.ORDERS, []);
  orders.unshift(order);
  storage.set(KEYS.ORDERS, orders);
  storage.set('last-order', order);

  store.clearCart();
  storage.remove('cart-promo');
  window.location.href = siteURL(`modules/checkout/order-confirmation.html?id=${encodeURIComponent(orderId)}`);
}

function setText(sel, v) { const el = document.querySelector(sel); if (el) el.textContent = v; }
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
