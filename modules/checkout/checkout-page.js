/**
 * checkout-page.js — multi-step checkout (Address → Delivery → Payment → Review).
 * Real validation (utils/validate-form.js), live summary, server-side order
 * placement with a localStorage fallback. Online payment (bKash/Nagad) is a
 * redirect that happens AFTER the order exists — see modules/checkout/payment-ui.js
 * and modules/payments/backend/endpoints.md; a failed payment never fails the
 * order, it just pays on delivery instead.
 */

import * as store from '../../shared/js/core/state.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { siteURL } from '../../shared/js/core/paths.js';
import { DEFAULT_OPTION, getDistrictsByDivision, quoteForDistrict } from '../delivery/backend/api.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { validateForm, validateField, attachLiveValidation, setFieldError } from '../../shared/js/utils/validate-form.js';
import { toast } from '../../shared/js/components/toast-notifications.js';
import { track, cartPayload, getAttribution } from '../../shared/js/core/analytics.js';
import { createOrder, persistOrderLocally } from './backend/api.js';
import { validatePromo } from '../cart/backend/api.js';
import { adaptPaymentOptions, maybeRedirectToGateway } from './payment-ui.js';

const form = document.querySelector('[data-checkout-form]');
const steps = [...document.querySelectorAll('.checkout-step')];
const indicators = [...document.querySelectorAll('[data-step-indicator]')];
let current = 1;
// Default to the metro rate; the radios (and later the district) refine it.
let deliveryCost = DEFAULT_OPTION.cost;
/* The promo discount in taka. Up here with the rest of the module state for
   the reason the note below gives: init() runs on line 41, paintSummary() is
   one of the first things it calls, and total() reads this — declared down
   with the summary code it would still be in its temporal dead zone. */
let discount = 0;

/* Declared ABOVE init(), which runs on the next line — `const` is in its
   temporal dead zone until the statement executes, so leaving these down with
   the stage logic threw "Cannot access 'wide' before initialization" and took
   the whole checkout with it. */
const wide = window.matchMedia('(min-width: 768px)');
const STAGE_OF = { 1: 1, 2: 1, 3: 2, 4: 2 };   // desktop grouping

/* The order summary is a <details>. It ships open — see the fragment — and
   1024px is where the layout gains the second column to hold it open in. */
const summaryPanel = document.querySelector('[data-summary-panel]');
const roomForSummary = window.matchMedia('(min-width: 1024px)');

const stageOf = (step) => (wide.matches ? STAGE_OF[step] : 1);
const stageCount = () => (wide.matches ? 2 : 1);
const visibleSteps = () => steps.filter((s) => stageOf(Number(s.dataset.step)) === current);


init();

async function init() {
  // Guard: empty cart → back to cart.
  if (!store.getCart().length) {
    document.querySelector('.checkout-layout').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1"><h2 class="empty-state__title">Your cart is empty</h2><p class="empty-state__text">Add something before checking out.</p><a class="btn-gr btn-primary-gr" href="${siteURL('')}">Start shopping</a></div>`;
    document.querySelector('[data-stepper]')?.remove();
    return;
  }

  attachLiveValidation(form);
  prefillFromUser();
  wireNav();
  wireDelivery();
  wireDistricts();
  wirePayment();
  wireSummaryPanel();
  // Async and unawaited on purpose: the page must not wait on a network call
  // to render, and until it answers the markup's own options stand.
  adaptPaymentOptions(form);
  paintSummary();
  form.addEventListener('submit', placeOrder);

  // Paints the first stage and, crucially, the nav — the markup ships with
  // both end buttons hidden, so without this a phone would render the whole
  // form and no way to place the order.
  showStep(1);

  // After the empty-cart guard has returned, so an abandoned cart page does
  // not report a checkout that never started.
  track('InitiateCheckout', cartPayload(store.getCart(), subtotal()));
}

/* ---- Stages ------------------------------------------------------------
 *
 * The four sections are unchanged and every field is still asked for. What
 * changed is how many screens they are spread over:
 *
 *   phone   — ONE page. Everything visible, one scroll, one Place Order.
 *   desktop — TWO stages. Address + Delivery, then Payment + Review.
 *
 * Four steps was four chances to leave. On cash on delivery, where the
 * customer is not even entering a card, three of those screens were a name,
 * an address, and a radio button they never changed.
 *
 * The grouping lives here rather than in the markup so the sections stay
 * independent and reorderable, and so a phone rotated to landscape past
 * 768px re-groups instead of being stuck in whatever it loaded as.
 */
function wireNav() {
  form.querySelector('[data-nav-next]')?.addEventListener('click', next);
  // Back is a link to the cart on the first stage and a button to the stage
  // before it on any other, so it is wired once and re-pointed in paintNav().
  form.querySelector('[data-nav-back]')?.addEventListener('click', (e) => {
    if (current > 1) { e.preventDefault(); showStep(current - 1); }
  });
  // Re-group live. Without this a resize across 768px leaves sections hidden
  // that the new layout should show — the classic "half my form vanished".
  wide.addEventListener('change', () => showStep(1));
}

function showStep(n) {
  current = Math.min(Math.max(1, n), stageCount());
  steps.forEach((s) => { s.hidden = stageOf(Number(s.dataset.step)) !== current; });

  indicators.forEach((ind) => {
    const i = Number(ind.dataset.stepIndicator);
    ind.classList.toggle('is-active', i === current);
    ind.classList.toggle('is-done', i < current);
  });

  paintNav();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // The review list is built from the answers above it, so it is painted when
  // it becomes visible — which on a phone is immediately.
  if (visibleSteps().some((s) => s.dataset.step === '4')) paintReview();
}

/** Which of the two end buttons is showing, and what Back means right now. */
function paintNav() {
  const last = current >= stageCount();
  const next$ = form.querySelector('[data-nav-next]');
  const place = form.querySelector('[data-place-order]');
  const back = form.querySelector('[data-nav-back]');

  if (next$) next$.hidden = last;
  if (place) place.hidden = !last;

  if (back) {
    const first = current === 1;
    back.href = first ? siteURL('cart') : '#';
    back.querySelector('.btn-gr__en').textContent = first ? '← Back to cart' : '← Back';
    back.querySelector('.btn-bn').textContent = first ? 'কার্টে ফিরে যান' : 'ফিরে যান';
  }
}

function next() {
  // Whatever is on screen has to be right before anything else is asked for.
  // On a phone that is the whole form, which is exactly what submit checks
  // anyway — so this only ever runs on the desktop hand-off.
  const { valid } = validateForm(form);
  if (!valid && anyVisibleInvalid()) { revealFirstError(); return; }
  if (current < stageCount()) showStep(current + 1);
}

function anyVisibleInvalid() {
  return [...form.querySelectorAll('.field-gr.is-invalid')].some((f) => f.offsetParent !== null);
}

/**
 * Show the stage the first bad field is on, then put the cursor in it.
 *
 * Submit used to jump to stage 1 unconditionally and say "please complete
 * your address". With payment and review now sharing a stage, a bad card
 * number would have sent the customer to a perfectly valid address form with
 * a message about it — hiding the actual problem behind a wrong explanation.
 */
function revealFirstError() {
  const bad = form.querySelector('.field-gr.is-invalid');
  if (!bad) return;

  const section = bad.closest('.checkout-step');
  const stage = section ? stageOf(Number(section.dataset.step)) : 1;
  if (stage !== current) showStep(stage);

  const input = bad.querySelector('input, select, textarea');
  input?.focus();
  bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
  toast.error('Please complete the highlighted field.');
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
    // The list is genuinely unreachable — the delivery API has already retried.
    // The select is now a box with nothing in it, and it is marked required,
    // so leaving it as it stands means Place Order refuses for good and never
    // says why. Drop the rule, put the reason where the customer is already
    // looking, and let the zone radios — which ship enabled — price the
    // delivery instead.
    districtsUnavailable(select);
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

/**
 * Turn the empty district select into something a customer can get past.
 *
 * Delivery still has to be priced, so the address line carries the district
 * and step 2's zone radios stay fully selectable — the same no-JS path the
 * markup was built around. The wording stops short of promising the order
 * will go through: PlaceOrderRequest still has district required|exists, so
 * once the API is live an order sent without one comes back refused, and a
 * reload is the only thing that can fetch the list again.
 */
function districtsUnavailable(select) {
  select.removeAttribute('data-validate');
  // A red flag left over from a Next click that landed while the list was
  // still loading would otherwise sit on a field we have just stopped asking
  // for, and nothing would ever clear it.
  select.closest('[data-field]')?.classList.remove('is-invalid');
  setFieldError(select, 'We couldn’t load the district list. Reload the page to try again — we need it to work out your delivery charge.');
}

/**
 * The chosen district's label, or ''.
 *
 * The placeholder option counts as selected until someone picks a real one,
 * so reading selectedOptions blind yields the words "Select your district" —
 * which, now that an unfillable select no longer blocks submit, would be
 * written into the stored order's address and read back on the receipt.
 */
function chosenDistrictName() {
  const select = form.querySelector('[data-district]');
  return select?.value ? select.selectedOptions[0].textContent : '';
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

/* ---- The summary panel on a phone --------------------------------------
 *
 * One column has no room for a reference panel at full height: it lands above
 * the form (see checkout.css for why it goes first) and pushes the first field
 * the customer has to fill below the fold. Closed, it is a single row that
 * still carries the total, which is the figure it is consulted for while the
 * form is being filled; the breakdown is one tap away.
 *
 * Open/closed is set here rather than in the markup because CSS cannot set it
 * and a media query cannot either. The markup ships `open`, so a phone with
 * no JS gets the whole panel rather than a row it cannot expand.
 */
function wireSummaryPanel() {
  if (!summaryPanel) return;
  const sync = () => { summaryPanel.open = roomForSummary.matches; };
  sync();
  // A phone rotated to landscape past 1024px opens it; back again closes it.
  roomForSummary.addEventListener('change', sync);
  // Above 1024px the row is not a control — there is nothing to collapse to
  // and the panel has its own column. preventDefault covers the click and the
  // Enter/Space that a focused <summary> turns into one.
  summaryPanel.addEventListener('click', (e) => {
    if (roomForSummary.matches && e.target.closest('summary')) e.preventDefault();
  });
}

/* ---- Summary + review -------------------------------------------------
 * The discount is held here rather than recomputed per caller, because
 * validating a code is async and total() is read synchronously from four
 * places — the summary, the review line, the Purchase pixel and the local
 * fallback order. paintSummary() is the single writer; every one of those four
 * used to omit the discount entirely.
 *
 * Re-validated on every paint against the LIVE subtotal, exactly as the cart
 * page does, so a basket that drops below a code's minimum spend loses the
 * discount here too instead of carrying a figure the server will refuse. */
function subtotal() { return store.cartSubtotal(); }
function total() { return Math.max(0, subtotal() - discount) + deliveryCost; }

async function paintSummary() {
  const cart = store.getCart();
  document.querySelector('[data-summary-items]').innerHTML = cart.map((l) => `
    <div class="cart-line" style="grid-template-columns:48px 1fr auto">
      <img class="cart-line__thumb" style="width:48px;height:48px" src="${escapeHtml(l.image)}" alt=""><div><div class="cart-line__title">${escapeHtml(l.title)}</div><div class="cart-line__meta">${l.variant ? `${escapeHtml(l.variant)} · ` : ''}Qty ${l.qty}</div></div>
      <div class="cart-line__price">${formatBDT(l.price * l.qty)}</div>
    </div>`).join('');
  const code = storage.get('cart-promo', null);
  const promo = code ? await validatePromo(code, subtotal()) : null;
  discount = promo?.valid ? promo.discount : 0;

  const row = document.querySelector('[data-sum-discount-row]');
  if (row) {
    row.hidden = discount <= 0;
    setText('[data-sum-promo]', discount > 0 ? `(${code})` : '');
    setText('[data-sum-discount]', `−${formatBDT(discount)}`);
  }

  setText('[data-sum-subtotal]', formatBDT(subtotal()));
  setText('[data-sum-delivery]', formatBDT(deliveryCost));
  setText('[data-sum-total]', formatBDT(total()));

  // The review step reads total() too, and it is painted from a different
  // trigger — repaint it here so the two can never show different numbers.
  if (!document.querySelector('[data-review-items]')?.children.length) return;
  paintReview();
}

function paintReview() {
  const g = (n) => form.querySelector(`[name="${n}"]`)?.value || '';
  const districtName = chosenDistrictName();
  setText('[data-review-address]', [g('fullName'), g('address'), g('area'), districtName, g('phone')].filter(Boolean).join(', '));
  setText('[data-review-delivery]', form.querySelector('[data-delivery]:checked')?.closest('.option-card').querySelector('.option-card__title').textContent || '');
  setText('[data-review-payment]', form.querySelector('[data-payment]:checked')?.closest('.option-card').querySelector('.option-card__title').textContent || '');
  document.querySelector('[data-review-items]').innerHTML = store.getCart().map((l) =>
    `<div class="review-line"><span>${l.qty} × ${escapeHtml(l.title)}${l.variant ? ` (${escapeHtml(l.variant)})` : ''}</span><span class="tabular">${formatBDT(l.price * l.qty)}</span></div>`).join('')
    + (discount > 0
      ? `<div class="review-line"><span>Promo discount</span><span class="tabular">−${formatBDT(discount)}</span></div>`
      : '')
    + `<div class="review-line"><span>Delivery</span><span class="tabular">${formatBDT(deliveryCost)}</span></div>`
    + `<div class="review-line" style="border:0;font-weight:600"><span>Total</span><span class="tabular">${formatBDT(total())}</span></div>`;
}

/* ---- Place order ------------------------------------------------------ */
/**
 * Server first, localStorage always.
 *
 * placeOrder() (the module API) answers one of three ways and each gets its
 * own path: `ok:true` means the server's order — every figure recomputed
 * there — becomes the local record too; `ok:false` means the server REFUSED
 * (stock, promo, validation) and the sale stops with the reason on screen and
 * the cart intact; `null` means there is no backend, and the order is written
 * locally exactly as this page always did, so the shop works identically the
 * day before and the day after the API deploys.
 */
async function placeOrder(e) {
  e.preventDefault();
  const { valid } = validateForm(form);
  if (!valid && anyVisibleInvalid()) { revealFirstError(); return; }

  // Card details, only when card is the chosen method — they are hidden for
  // cash on delivery, and a hidden field must never block an order. This used
  // to run when leaving the payment STEP; payment now shares a stage with
  // review, so submit is the last moment it can run.
  if (form.querySelector('[data-payment]:checked')?.value === 'card') {
    const ok = ['cardNum', 'cardExp', 'cardCvc']
      .every((n) => validateField(form.querySelector(`[name="${n}"]`), form));
    if (!ok) { revealFirstError(); return; }
  }

  // A slow server plus an anxious double-click must not become two orders.
  const btn = form.querySelector('[data-place-order]');
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;

  const g = (n) => form.querySelector(`[name="${n}"]`)?.value || '';
  const cart = store.getCart();

  // Before the redirect. `track` sends the server mirror with keepalive, so
  // the request survives the navigation — without it the browser cancels it
  // and the conversion is lost at the last step. Fired before the POST so the
  // event id can ride on the order for Conversions-API dedupe.
  const eventId = track('Purchase', { ...cartPayload(cart, total()), value: Number(total().toFixed(2)) });

  const result = await createOrder({
    items: cart.map((l) => ({ sku: l.id, qty: l.qty, variant: l.variant ?? null })),
    name: g('fullName'),
    phone: g('phone'),
    email: g('email') || null,
    address: g('address'),
    area: g('area') || null,
    district: form.querySelector('[data-district]')?.value || '',
    notes: g('notes') || null,
    delivery: form.querySelector('[data-delivery]:checked')?.value,
    payment: form.querySelector('[data-payment]:checked')?.value,
    promoCode: storage.get('cart-promo', null),
    website: g('website') || null,
    source: getAttribution(),
    eventId,
  });

  if (result && result.ok === false) {
    // The server said no and said why — stock, promo, district. The cart is
    // untouched; the customer fixes the named problem and tries again.
    //
    // Except a promo refusal, which the customer cannot fix: checkout has no
    // promo UI, so a stored code the server has stopped accepting refused the
    // order on every retry, forever, about a code shown nowhere on the page.
    // Drop it and repaint, so tapping Place Order again actually can succeed —
    // at the undiscounted price, which is the honest outcome and is now
    // visible in the summary before they tap.
    if (/code|promo|coupon|discount|spend/i.test(result.message || '')) {
      storage.remove('cart-promo');
      await paintSummary();
    }
    if (btn) btn.disabled = false;
    toast.error(result.message);
    return;
  }

  const order = result?.ok
    // The server's record, which the whole local UI can already read: the
    // confirmation, track and account pages consume exactly this shape.
    ? { ...result.order, eventId }
    // No backend — the local mock, unchanged from the day it was written.
    : {
        id: 'GR-2026-' + Math.floor(1000 + performance.now() % 9000),
        date: new Date().toISOString().slice(0, 10),
        status: 'processing',
        total: total(),
        // variant is part of what was bought: an order record that says
        // "Ajwa Dates" without the pack size cannot be picked or refunded.
        items: cart.map((l) => ({ id: l.id, title: l.title, variant: l.variant ?? null, qty: l.qty, price: l.price, image: l.image })),
        address: [g('address'), g('area'), chosenDistrictName()]
          .filter(Boolean).join(', '),
        phone: g('phone'),
        email: g('email') || null,
        delivery: form.querySelector('[data-delivery]:checked')?.value,
        payment: form.querySelector('[data-payment]:checked')?.value,
        source: getAttribution(),
        eventId,
      };

  persistOrderLocally(order);

  store.clearCart();
  storage.remove('cart-promo');

  // bKash/Nagad orders detour through the gateway — but only when the order
  // really reached the server (a local mock order has nothing to pay) and the
  // server can arrange it. Every "no" lands on the confirmation page with the
  // order intact and payable on delivery.
  if (result?.ok && await maybeRedirectToGateway(order, g('phone'))) return;

  window.location.href = siteURL(`order-confirmed?id=${encodeURIComponent(order.id)}`);
}

/* Every match, not the first: the total is written in two places on a phone —
   the closed summary row and the Total line inside it — and a first-match-only
   helper left the closed row reading ৳ 0 for the whole of checkout. */
function setText(sel, v) { document.querySelectorAll(sel).forEach((el) => { el.textContent = v; }); }
/* The textContent round-trip escapes &, < and > but not the double quote, so
   it cannot be trusted inside an attribute — and the order summary now puts a
   stored cart line's image path in one. Without the quote, `x" onerror="…` as
   an image path would run on the checkout page itself. &quot; renders as a
   plain " in text, so the title and variant above are unaffected. */
function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
