/**
 * express-page.js — one-screen checkout for paid-social traffic.
 *
 * WHY THIS EXISTS SEPARATELY FROM checkout-page.js
 * ------------------------------------------------
 * Both place the same order. They serve opposite intents.
 *
 * checkout.html serves someone who has been browsing: they have a cart, maybe
 * several items, and the four steps give them room to change their mind. Its
 * first act is `if (!store.getCart().length) → "Your cart is empty"`, which is
 * exactly right there and fatal here: an ad click arrives with an empty cart,
 * so sending that traffic to checkout.html sends it to a dead end.
 *
 * This page serves someone who tapped "Buy" on one specific product in an ad.
 * The item comes from the URL. There is one screen, cash on delivery is
 * pre-selected, and confirming does not navigate — the receipt replaces the
 * form in place, which also means the back button cannot resubmit.
 *
 *   express.html?sku=gr-1101&qty=1&utm_source=facebook&utm_campaign=decor-aug
 *
 * The order object is deliberately the same shape checkout-page.js writes, so
 * account/orders, track.html and confirmation all read it without knowing
 * which checkout produced it. The only addition is `source`, which carries the
 * ad attribution.
 *
 * // TODO: connect to payment gateway (modules/checkout/backend/endpoints.md).
 * // Non-COD methods currently record the choice and place the order exactly
 * // as COD does — there is no gateway yet, on either checkout.
 */

import { getProductById, getRelated } from '../catalog/backend/api.js';
import { validatePromo } from '../cart/backend/api.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { siteURL } from '../../shared/js/core/paths.js';
import { getParam } from '../../shared/js/core/router-helpers.js';
import { DEFAULT_OPTION, getDistrictsByDivision, quoteForDistrict } from '../delivery/backend/api.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { validateForm, attachLiveValidation } from '../../shared/js/utils/validate-form.js';
import { renderProductGrid } from '../../shared/js/components/product-card.js';
import { toast } from '../../shared/js/components/toast-notifications.js';
import { track, productPayload, getAttribution } from '../../shared/js/core/analytics.js';
import { createOrder, persistOrderLocally } from './backend/api.js';
import { adaptPaymentOptions, maybeRedirectToGateway } from './payment-ui.js';

const root = document.querySelector('[data-express]');
const form = document.querySelector('[data-express-form]');
const bar = document.querySelector('[data-express-bar]');
const sheet = document.querySelector('[data-express-confirm]');

let product = null;
let qty = 1;
let quote = DEFAULT_OPTION;
let placing = false;

init();

async function init() {
  if (!root) return;

  const sku = getParam('sku') || getParam('id');
  qty = clampQty(Number(getParam('qty')) || 1);

  if (!sku) return showGone('No product was specified in the link.');

  try {
    product = await getProductById(sku);
  } catch {
    return showGone('We couldn’t load this product just now.');
  }

  // getProductById already runs through the active filter, so a withdrawn
  // product is null here rather than a listing nobody can buy.
  if (!product) return showGone('This product is no longer listed.');
  if (product.inStock === false) return showGone('This product is out of stock.');

  paintItem();
  await fillDistricts();
  attachLiveValidation(form);
  prefill();
  wire();
  // Unawaited: the ad-landing page must paint instantly, and until the server
  // answers, the markup's own payment options stand.
  adaptPaymentOptions(form);
  form.hidden = false;
  bar.hidden = false;
  repaintTotals();

  // Arriving here IS starting a checkout — there is no earlier step to fire it
  // from, which is the whole point of the page. Meta optimises delivery on
  // this event long before there are enough purchases to learn from.
  track('InitiateCheckout', productPayload(product, qty));
}

/* ---- The item --------------------------------------------------------- */
function paintItem() {
  const el = document.querySelector('[data-express-item]');
  document.querySelector('[data-express-img]').src = siteURL(String(product.image || '').replace(/^\//, ''));
  document.querySelector('[data-express-img]').alt = product.title;
  document.querySelector('[data-express-title]').textContent = product.title;
  document.querySelector('[data-express-meta]').textContent =
    [product.brand, product.unit].filter(Boolean).join(' · ') || product.categoryName || '';
  document.querySelector('[data-qty-input]').value = String(qty);
  el.hidden = false;
}

function showGone(msg) {
  document.querySelector('[data-express-item]').hidden = true;
  form.hidden = true;
  bar.hidden = true;
  const gone = document.querySelector('[data-express-gone]');
  document.querySelector('[data-express-gone-msg]').textContent = msg;
  document.querySelector('[data-express-gone-link]').href = siteURL('index.html');
  gone.hidden = false;
}

/* ---- Delivery --------------------------------------------------------- */
async function fillDistricts() {
  const select = form.querySelector('[data-district]');
  try {
    const byDivision = await getDistrictsByDivision();
    for (const [division, list] of Object.entries(byDivision)) {
      const group = document.createElement('optgroup');
      group.label = division;
      for (const d of list) {
        const opt = document.createElement('option');
        opt.value = d.key;
        opt.textContent = d.name;
        group.append(opt);
      }
      select.append(group);
    }
  } catch {
    // The zone still defaults to metro and the order can still be placed; a
    // missing district list must not block a sale.
    toast.error?.('Couldn’t load districts — pick your area in the address line.');
  }
}

/* The coupon that rode in on the ad link (coupon-link.js), or was applied in
   the cart. Express is the ad landing page, so this is where "use code
   GULF10" in the ad copy has to become a number on screen — re-validated
   against the live subtotal on every repaint, exactly as the cart does, and
   sent with the order only while it holds. The server stays the authority. */
const storedPromo = storage.get('cart-promo', null);
const promoCode = typeof storedPromo === 'string' ? storedPromo : (storedPromo?.code ?? null);
let promoDiscount = 0;

async function repaintTotals() {
  const sub = (product?.price ?? 0) * qty;

  promoDiscount = 0;
  if (promoCode) {
    const r = await validatePromo(promoCode, sub);
    if (r.valid) promoDiscount = r.discount;
  }
  const row = document.querySelector('[data-sum-discount-row]');
  if (row) {
    row.hidden = promoDiscount === 0;
    setText('[data-sum-promo]', `· ${promoCode}`);
    setText('[data-sum-discount]', `−${formatBDT(promoDiscount)}`);
  }

  const total = Math.max(0, sub - promoDiscount) + quote.cost;
  setText('[data-sum-subtotal]', formatBDT(sub));
  setText('[data-sum-delivery]', formatBDT(quote.cost));
  setText('[data-sum-zone]', quote.label ? `· ${quote.label}` : '');
  setText('[data-sum-total]', formatBDT(total));
  setText('[data-bar-total]', formatBDT(total));
}

/* The email field starts folded: it is the one box a parcel does not need,
   and every visible box makes the form look slower than it is. JS does the
   folding, so no-JS visitors simply see the field. A visitor whose browser
   autofills email keeps it visible — hiding a filled field would silently
   carry data they can no longer see. */
function foldEmail() {
  const wrap = document.querySelector('[data-email-wrap]');
  const btn = document.querySelector('[data-email-toggle]');
  if (!wrap || !btn) return;
  const input = wrap.querySelector('input');
  if (input.value) return;            // autofilled before we got here
  wrap.hidden = true;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    btn.hidden = true;
    wrap.hidden = false;
    input.focus();
  }, { once: true });
}

/* ---- Wiring ----------------------------------------------------------- */
function wire() {
  foldEmail();
  // quoteForDistrict is async — it may still be fetching districts.json on the
  // first change. Awaiting it matters: assigning the promise would put
  // "[object Promise]" through formatBDT and charge the wrong delivery fee.
  form.querySelector('[data-district]').addEventListener('change', async (e) => {
    quote = (await quoteForDistrict(e.target.value)) || DEFAULT_OPTION;
    repaintTotals();
  });

  document.querySelector('[data-qty-dec]').addEventListener('click', () => setQty(qty - 1));
  document.querySelector('[data-qty-inc]').addEventListener('click', () => setQty(qty + 1));
  document.querySelector('[data-qty-input]').addEventListener('change', (e) => setQty(Number(e.target.value)));

  document.querySelector('[data-express-place]').addEventListener('click', openConfirm);
  document.querySelector('[data-express-cancel]').addEventListener('click', closeConfirm);
  document.querySelector('[data-express-cancel-scrim]').addEventListener('click', closeConfirm);
  document.querySelector('[data-express-confirm-yes]').addEventListener('click', confirmOrder);

  // Enter in any field is "place order", not "submit a half-filled form".
  form.addEventListener('submit', (e) => { e.preventDefault(); openConfirm(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) closeConfirm();
  });
}

function setQty(n) {
  qty = clampQty(n);
  document.querySelector('[data-qty-input]').value = String(qty);
  repaintTotals();
}

function clampQty(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(99, Math.max(1, Math.trunc(n)));
}

/* ---- Confirm ---------------------------------------------------------- */
function openConfirm() {
  const { valid } = validateForm(form);
  if (!valid) {
    // Focus the first thing that is wrong. On a phone the invalid field is
    // often off screen, and an inert button with a red line somewhere above
    // reads as the page being broken.
    form.querySelector('[data-field].is-invalid input, [data-field].is-invalid select')?.focus();
    toast.error('Please check the highlighted fields.');
    return;
  }

  const method = paymentLabel();
  setText('[data-confirm-line]',
    `${qty} × ${product.title} — ${formatBDT(product.price * qty + quote.cost)} total, ${method}.`);
  setText('[data-confirm-addr]', addressLine());
  sheet.hidden = false;
  document.querySelector('[data-express-confirm-yes]').focus();
}

function closeConfirm() {
  sheet.hidden = true;
  document.querySelector('[data-express-place]').focus();
}

/* ---- Place ------------------------------------------------------------ */
/**
 * Server first, localStorage always — same three-way contract as the cart
 * checkout, through the same createOrder() seam. `ok:false` is the one path
 * with UI here: the sheet closes, the reason lands as a toast, and the form
 * stays exactly as typed so the customer can fix the named problem.
 */
async function confirmOrder() {
  // Double-tap on a slow phone would otherwise write two orders.
  if (placing) return;
  placing = true;

  // The round-trip to a shared-hosting backend can take a second or two, and
  // a button that goes silent for that long reads as broken — which invites
  // exactly the second tap the guard above exists to swallow.
  const yes = document.querySelector('[data-express-confirm-yes]');
  yes.disabled = true;
  yes.textContent = 'Placing…';
  const restore = () => { yes.disabled = false; yes.textContent = 'Yes, order now'; };

  const local = buildOrder();

  // Before placing, so the event_id lands ON the order. When the server
  // forwards the same purchase to the Conversions API it must reuse this id
  // or Meta counts the sale twice.
  const eventId = track('Purchase', {
    ...productPayload(product, qty),
    value: Number(local.total.toFixed(2)),
  });
  local.eventId = eventId;

  const g = (n) => form.querySelector(`[name="${n}"]`)?.value.trim() || '';
  const result = await createOrder({
    items: [{ sku: product.id, qty, variant: null }],
    name: g('fullName'),
    phone: g('phone'),
    email: g('email') || null,
    address: g('address'),
    area: g('area') || null,
    district: form.querySelector('[data-district]')?.value || '',
    notes: null,
    delivery: quote.id,
    payment: form.querySelector('[data-payment]:checked')?.value || 'cod',
    promoCode: promoDiscount > 0 ? promoCode : null,
    website: g('website') || null,
    source: adSource(),
    eventId,
  });

  if (result && result.ok === false) {
    // Refused — stock, district, validation. Nothing was written anywhere.
    placing = false;
    restore();
    sheet.hidden = true;
    toast.error(result.message);
    return;
  }

  const order = result?.ok ? { ...result.order, eventId } : local;
  persistOrderLocally(order);

  // A bKash/Nagad order leaves for the gateway here; it lands on the
  // confirmation page afterwards with the verdict. Only for a server order —
  // a local mock has nothing to pay — and every "no" falls through to the
  // done-sheet with the order intact, payable on delivery.
  if (result?.ok && await maybeRedirectToGateway(order, g('phone'))) return;

  restore();
  sheet.hidden = true;
  showDone(order);
}

function buildOrder() {
  const g = (n) => form.querySelector(`[name="${n}"]`)?.value.trim() || '';
  return {
    id: 'GR-2026-' + Math.floor(1000 + (performance.now() % 9000)),
    date: new Date().toISOString().slice(0, 10),
    status: 'processing',
    total: product.price * qty + quote.cost,
    items: [{
      id: product.id,
      title: product.title,
      variant: null,
      qty,
      price: product.price,
      image: product.image,
    }],
    address: addressLine(),
    phone: g('phone'),
    email: g('email') || null,
    delivery: quote.id,
    payment: form.querySelector('[data-payment]:checked')?.value || 'cod',
    // Which ad sold this. Kept on the order so the merchant can tell a
    // campaign that spends from a campaign that sells.
    source: adSource(),
  };
}

function addressLine() {
  const g = (n) => form.querySelector(`[name="${n}"]`)?.value.trim() || '';
  const district = form.querySelector('[data-district]')?.selectedOptions[0]?.textContent || '';
  return [g('fullName'), g('address'), g('area'), district, g('phone')].filter(Boolean).join(', ');
}

function paymentLabel() {
  const v = form.querySelector('[data-payment]:checked')?.value || 'cod';
  return { cod: 'cash on delivery', bkash: 'bKash', nagad: 'Nagad', card: 'card' }[v] || v;
}

/**
 * Which ad recruited this customer, or null if the visit was organic.
 *
 * From the stored FIRST-TOUCH attribution, not from this page's URL. Reading
 * the URL only works when the ad links straight here; the moment someone
 * lands on a product page, browses, and reaches express checkout by another
 * route, the UTMs are gone and every one of those orders looks organic.
 * analytics.js captures them on the first page of the visit and keeps them.
 */
function adSource() {
  return getAttribution();
}

/* ---- Receipt ---------------------------------------------------------- */
async function showDone(order) {
  document.querySelector('[data-express-state="form"]').hidden = true;
  bar.hidden = true;

  const done = document.querySelector('[data-express-state="done"]');
  setText('[data-done-id]', order.id);
  setText('[data-done-eta]', order.eta || quote.eta || '');
  setText('[data-done-pay]', order.payment === 'cod'
    ? `Pay ${formatBDT(order.total)} in cash when the rider arrives.`
    : `We’ll contact you on ${order.phone} to collect payment by ${paymentLabel()}.`);
  document.querySelector('[data-done-track]').href =
    siteURL(`modules/account/track.html?id=${encodeURIComponent(order.id)}`);
  done.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Four more products under the receipt. This is the cheapest impression the
  // shop will ever get: the customer is already converted and still on screen.
  try {
    const more = await getRelated(product, 4);
    const grid = document.querySelector('[data-express-more]');
    if (more.length) renderProductGrid(grid, more);
    else grid.closest('.express-more').hidden = true;
  } catch {
    document.querySelector('[data-express-more]')?.closest('.express-more')?.setAttribute('hidden', '');
  }
}

/* ---- Misc ------------------------------------------------------------- */
function prefill() {
  const me = storage.get(KEYS.USER, null);
  if (!me) return;
  const set = (n, v) => { const el = form.querySelector(`[name="${n}"]`); if (el && v && !el.value) el.value = v; };
  set('fullName', me.name);
  set('phone', me.phone);
  set('email', me.email);
}

function setText(sel, v) { const el = document.querySelector(sel); if (el) el.textContent = v; }
