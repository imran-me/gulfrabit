/**
 * order-new-page.js — typing in an order that did not come through the website.
 *
 * WHY THIS EXISTS
 * ---------------
 * A shop that advertises on Facebook takes a good share of its orders by ear:
 * somebody rings, or writes on WhatsApp, or answers a post. Until this screen
 * the only thing able to write an order was the storefront's checkout, so
 * those orders lived in a notebook — no slip, no courier booking, no SMS, no
 * place in any count. Now they are typed in here and from that moment are
 * orders like any other.
 *
 * THE BROWSER ADDS NOTHING UP
 * ---------------------------
 * There is no price arithmetic in this file. Every time a line, a pack, a
 * district or a code changes, the form asks POST /orders/quote and paints what
 * comes back — which is worked out by the same server code that will write
 * the order. So the total read out to a customer on the phone is the total on
 * the slip, and this file never has to learn what a pack, a promotion or a
 * delivery zone costs. The unit price shown beside a pack is the catalogue's
 * own figure, displayed, never multiplied.
 *
 * NOTHING HERE IS A PRICE FIELD. Staff choose products, packs and quantities.
 * A discount is a coupon code, which is data the Coupons screen owns, not a
 * number somebody types while a customer is haggling.
 *
 * ENTER DOES NOT PLACE THE ORDER. Placing one texts a customer, and this is a
 * form somebody fills in fast with a phone on their shoulder — Enter after a
 * quantity would otherwise be an order nobody meant to send. The button is the
 * only way.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { may, toast } from './admin-delete.js';
import { thumb } from './admin-thumb.js';
import { mountProductPicker } from './product-picker.js';
import { MANUAL_CHANNELS, stageLabel, stageTone } from './order-stages.js';
// Delivery owns the district list; this is the same door the checkout uses.
import { getDistrictsByDivision } from '../delivery/backend/api.js';

/* The server's own pattern (OrderStoreRequest), applied after spaces and
   dashes are taken out — people read a number in groups and type it the way
   they heard it. */
const PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;

/* Stages in which an earlier order is still on its way. Seeing one of these
   against the number being typed is the commonest reason NOT to place a new
   order: the customer ordered on the website an hour ago and is ringing to
   check on it. */
const IN_PROGRESS = ['placed', 'confirmed', 'packed', 'ready_for_courier', 'shipped'];
const WENT_BADLY = ['returned', 'cancelled', 'spam'];

let form;
let picker;

/** @type {Array<{sku:string,title:string,brand:?string,image:?string,packs:Array,variant:?string,qty:number,maxQty:number,isPreorder:boolean}>} */
let lines = [];

/* The server's last answer, and whether it is still the answer to what is on
   screen. `quoting` is true from the moment anything changes until the reply
   to THAT change lands — Place order is held for exactly that long, so nobody
   can place against a total that is one keystroke out of date. */
let quote = null;
let quoteProblem = null;
let quoting = false;
let quoteToken = 0;
let quoteTimer = 0;

let delivery = null;       // the zone the staff member picked, when there is a choice
let districts = [];        // flat, for matching a past order's district by name
let placing = false;
let knownToken = 0;

document.addEventListener('admin:ready', init);

function init() {
  form = document.querySelector('[data-entry-form]');
  if (!form) return;

  // Courtesy, not control: the routes carry `admin:orders.edit` and refuse on
  // their own. This is so the account sees a sentence instead of a form whose
  // every request comes back 403.
  if (!may('orders.edit')) {
    document.querySelector('[data-entry-denied]').hidden = false;
    return;
  }

  form.hidden = false;

  form.channel.innerHTML = MANUAL_CHANNELS
    .map((c) => `<option value="${escapeHtml(c.key)}">${escapeHtml(c.label)}</option>`).join('');

  picker = mountProductPicker(document.querySelector('[data-entry-picker]'), {
    endpoint: '/orders/products',
    placeholder: 'Search by product name, SKU or brand…',
    note: (p) => (p.orderable === false ? 'out of stock' : p.isPreorder ? 'pre-order' : ''),
    onPick: addLine,
  });

  fillDistricts();
  wire();
  paintLines();
  paintSummary();
}

/* ---- Districts --------------------------------------------------------- */

async function fillDistricts() {
  const select = form.district;

  let byDivision;
  try {
    byDivision = await getDistrictsByDivision();
  } catch {
    // The list is what prices delivery, so without it no order can be placed.
    // Said in the control itself, where the person is looking.
    select.innerHTML = '<option value="">Could not load districts — reload the page</option>';
    return;
  }

  for (const [division, list] of Object.entries(byDivision)) {
    const group = document.createElement('optgroup');
    group.label = division;
    for (const d of list) {
      const opt = document.createElement('option');
      opt.value = d.key;
      opt.textContent = d.name;
      group.append(opt);
      districts.push(d);
    }
    select.append(group);
  }
}

/* ---- Wiring ------------------------------------------------------------ */

function wire() {
  form.addEventListener('submit', place);

  form.addEventListener('keydown', (e) => {
    // See the file header. Textareas keep Enter (it is a new line), and so
    // does the Place button itself, which is not an input.
    if (e.key === 'Enter' && e.target.matches('input, select')) e.preventDefault();
  });

  // One listener each on the list, which survives every repaint, rather than
  // handlers on rows that are thrown away when a line is added.
  const list = document.querySelector('[data-entry-lines]');

  list.addEventListener('click', (e) => {
    const row = e.target.closest('[data-line]');
    if (!row) return;
    const line = lines[Number(row.dataset.line)];

    if (e.target.closest('[data-line-remove]')) {
      lines.splice(Number(row.dataset.line), 1);
      paintLines();
      return requote();
    }
    if (e.target.closest('[data-line-dec]')) return setQty(row, line, line.qty - 1);
    if (e.target.closest('[data-line-inc]')) return setQty(row, line, line.qty + 1);
  });

  list.addEventListener('change', (e) => {
    const row = e.target.closest('[data-line]');
    if (!row) return;
    const at = Number(row.dataset.line);
    const line = lines[at];

    if (e.target.matches('[data-line-qty]')) return setQty(row, line, Number(e.target.value));

    if (e.target.matches('[data-line-pack]')) {
      line.variant = e.target.value;

      // Switching a line to a pack another line already holds makes them the
      // same line. The server would fold them together anyway; doing it here
      // keeps one row on screen for one row on the order.
      const twin = lines.findIndex((l, i) => i !== at && l.sku === line.sku && l.variant === line.variant);
      if (twin >= 0) {
        lines[twin].qty = Math.min(lines[twin].qty + line.qty, lines[twin].maxQty);
        lines.splice(at, 1);
        paintLines();
      }
      requote();
    }
  });

  form.district.addEventListener('change', () => {
    // A delivery choice belongs to the district it was offered for. Carrying
    // "express" from Dhaka to Sylhet would be asking for a service the server
    // will, rightly, ignore.
    delivery = null;
    requote();
  });

  document.querySelector('[data-entry-delivery-options]').addEventListener('change', (e) => {
    if (!e.target.matches('[name="delivery"]')) return;
    delivery = e.target.value;
    requote();
  });

  form.payment.addEventListener('change', () => {
    document.querySelector('[data-entry-payhint]').hidden = form.payment.value === 'cod';
    // Payment is part of the question: a pre-order cannot be bought on
    // delivery, and the quote is what says so.
    requote();
  });

  form.promo.addEventListener('change', requote);

  // Looked up as the number is typed, so by the time the name is being asked
  // for, the screen already knows whether this is somebody the shop has met.
  let lookupTimer = 0;
  form.phone.addEventListener('input', () => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(lookUp, 350);
  });

  document.querySelector('[data-entry-known]').addEventListener('click', (e) => {
    const use = e.target.closest('[data-known-use]');
    if (use) useKnown(use);
  });

  document.querySelector('[data-done-again]').addEventListener('click', startAgain);

  // A half-typed order lost to a stray click on the sidebar, mid-call, has to
  // be asked for again from a customer who has already said it once.
  window.addEventListener('beforeunload', (e) => {
    if (lines.length && !placing && !form.hidden) e.preventDefault();
  });
}

/* ---- Lines ------------------------------------------------------------- */

function addLine(p) {
  if (p.orderable === false) {
    // Offered in the list so "do you have it?" can be answered, refused here
    // so it cannot be sold. The sentence is the server's own.
    return toast(p.unavailable || `${p.title} cannot be ordered right now.`, false);
  }

  const packs = (p.variants || []).filter((v) => v?.label);
  let variant = null;

  // A product with several packs always records one, so an order never
  // reaches the warehouse with the size missing — the shop's own default
  // first, the first pack that is actually on the shelf otherwise. One pack
  // or none is a product with nothing to choose. Same rule as packFor() in
  // OrderService, which is the one that counts.
  if (packs.length > 1) {
    const preferred = packs.find((v) => same(v.label, p.defaultVariant)) || packs[0];
    const usable = preferred.inStock !== false ? preferred : packs.find((v) => v.inStock !== false);

    if (!usable) return toast(`Every pack of ${p.title} is out of stock.`, false);
    variant = usable.label;
  }

  const existing = lines.find((l) => l.sku === p.sku && l.variant === variant);

  if (existing) {
    // Picking the same thing twice means "another one", which is what the
    // cart makes of it too.
    existing.qty = Math.min(existing.qty + 1, existing.maxQty);
  } else {
    lines.push({
      sku: p.sku,
      title: p.title,
      brand: p.brand || null,
      image: p.image || null,
      packs,
      variant,
      qty: 1,
      maxQty: Number(p.maxQty) || 99,
      isPreorder: !!p.isPreorder,
      availableFrom: p.availableFrom || null,
    });
  }

  paintLines();
  requote();
}

function setQty(row, line, wanted) {
  const qty = Math.min(line.maxQty, Math.max(1, Math.trunc(Number(wanted)) || 1));
  line.qty = qty;
  // Written back into the box rather than repainting the list: a repaint
  // would take the focus out of the field somebody is still typing in.
  row.querySelector('[data-line-qty]').value = String(qty);
  requote();
}

function paintLines() {
  const host = document.querySelector('[data-entry-lines]');

  document.querySelector('[data-entry-empty]').hidden = lines.length > 0;

  host.innerHTML = lines.map((l, i) => {
    const title = escapeHtml(l.title);

    return `
    <li class="aline" data-line="${i}">
      ${thumb(l.image, l.title)}
      <div class="aline__ident">
        <div class="aline__title">${title}</div>
        <div class="atable__sub">${escapeHtml(l.sku)}${l.brand ? ` · ${escapeHtml(l.brand)}` : ''}</div>
        ${l.isPreorder ? `<div class="atable__sub aline__flag">Pre-order${
          l.availableFrom ? ` — lands ${escapeHtml(day(l.availableFrom))}` : ''}</div>` : ''}
      </div>
      ${l.packs.length > 1 ? `
        <select class="select-gr aline__pack" data-line-pack aria-label="Pack of ${title}">
          ${l.packs.map((v) => `
            <option value="${escapeHtml(v.label)}"${same(v.label, l.variant) ? ' selected' : ''}${
              v.inStock === false ? ' disabled' : ''}>
              ${escapeHtml(v.label)} — ৳ ${money(v.priceTaka)}${v.inStock === false ? ' (out of stock)' : ''}
            </option>`).join('')}
        </select>` : '<span class="aline__pack"></span>'}
      <div class="aqty">
        <button type="button" data-line-dec aria-label="One fewer ${title}">−</button>
        <input class="input-gr" type="number" inputmode="numeric" min="1" max="${l.maxQty}"
               value="${l.qty}" data-line-qty aria-label="Quantity of ${title}">
        <button type="button" data-line-inc aria-label="One more ${title}">+</button>
      </div>
      <div class="aline__sum" data-line-sum></div>
      <button type="button" class="aline__remove" data-line-remove aria-label="Remove ${title}">×</button>
    </li>`;
  }).join('');

  paintSums();
}

/** Each line's price, from the server's answer — or a dash while there is none. */
function paintSums() {
  document.querySelectorAll('[data-entry-lines] [data-line]').forEach((row) => {
    const line = lines[Number(row.dataset.line)];
    const priced = quote?.lines.find((q) => same(q.sku, line.sku) && same(q.variant, line.variant));
    const cell = row.querySelector('[data-line-sum]');

    cell.innerHTML = priced
      ? `<strong>৳ ${money(priced.lineTaka)}</strong>${
          priced.qty > 1 ? `<span class="atable__sub">৳ ${money(priced.unitTaka)} each</span>` : ''}`
      : '<span class="atable__sub">—</span>';
  });
}

/* ---- The quote --------------------------------------------------------- */

function quotePayload() {
  return {
    lines: lines.map(({ sku, qty, variant }) => ({ sku, qty, variant })),
    district: form.district.value || null,
    delivery,
    payment: form.payment.value,
    promo: form.promo.value.trim() || null,
  };
}

/**
 * Ask the server what this comes to, and paint the answer.
 *
 * Debounced, because a stepper pressed five times is one question. Every call
 * takes a token and only the newest may paint — the reply to "2 of them" must
 * not land after, and over, the reply to "3 of them".
 */
function requote() {
  clearTimeout(quoteTimer);
  const mine = ++quoteToken;

  if (!lines.length) {
    quote = null;
    quoteProblem = null;
    quoting = false;
    return paintSummary();
  }

  quoting = true;
  paintSummary();

  quoteTimer = setTimeout(async () => {
    let answer = null;
    let problem = null;

    try {
      ({ data: answer } = await adminFetch('/orders/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotePayload()),
      }));
    } catch (err) {
      problem = unreachable(err) || err.message;
    }

    if (mine !== quoteToken) return;

    quote = answer;
    quoteProblem = problem;
    quoting = false;
    paintSummary();
  }, 200);
}

/**
 * The sentence for "nothing answered", or null when something did.
 *
 * A 404 or 501 is a static file server — this panel on a machine with no PHP.
 * No status at all is a request that never completed. Anything else is the
 * server's own refusal, and its words are better than ours.
 */
function unreachable(err) {
  if (err.status === 404 || err.status === 501) {
    return 'No backend connected yet — prices and orders appear once the API is live.';
  }
  if (!err.status) return 'Could not reach the server. Check the connection.';
  return null;
}

function paintSummary() {
  paintSums();

  const t = quote?.totals;
  const chosen = quote?.delivery?.chosen;
  const promo = quote?.promo;
  const totals = document.querySelector('[data-entry-totals]');

  // Dimmed while the figures on screen are answering an older question.
  totals.classList.toggle('is-stale', quoting);

  const rows = !t ? [] : [
    ['Subtotal', `৳ ${money(t.subtotalTaka)}`],
    ...(t.discountTaka ? [[`Discount${promo?.code ? ` (${promo.code})` : ''}`, `− ৳ ${money(t.discountTaka)}`]] : []),
    // "Not priced yet" and "free" are different facts, and the server sends
    // them as different values. Only one of them prints a number.
    ['Delivery' + (chosen ? ` · ${chosen.label}` : ''),
      t.deliveryTaka === null ? 'Choose a district' : `৳ ${money(t.deliveryTaka)}`],
    [t.deliveryTaka === null ? 'Total before delivery' : 'Total', `৳ ${money(t.totalTaka)}`],
  ];

  totals.innerHTML = rows.map(([label, value], i) => `
    <div class="atotals__row${i === rows.length - 1 ? ' is-total' : ''}">
      <dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>
    </div>`).join('');

  paintDelivery(quote?.delivery);

  const promoHint = document.querySelector('[data-entry-promo]');
  promoHint.hidden = !promo;
  if (promo) {
    promoHint.classList.toggle('is-bad', !!promo.problem);
    promoHint.textContent = promo.problem
      || (t.discountTaka ? `${promo.code} applied — ৳ ${money(t.discountTaka)} off.` : `${promo.code} applied.`);
  }

  const pre = document.querySelector('[data-entry-preorder]');
  pre.hidden = !quote?.shipsOn;
  if (quote?.shipsOn) {
    pre.textContent = quote.splits
      ? `Part of this is a pre-order. It will be placed as two orders: what is in stock ships now, `
        + `and the rest ships when it lands on ${day(quote.shipsOn)}. Delivery is charged once.`
      : `This is a pre-order — it ships when the stock lands on ${day(quote.shipsOn)}.`;
  }

  const error = document.querySelector('[data-entry-error]');
  error.hidden = !quoteProblem;
  if (quoteProblem) error.textContent = quoteProblem;

  const btn = document.querySelector('[data-entry-place]');
  // Held while there is nothing to place, while the total is being worked
  // out, and while the order is on its way. Everything else — a missing name,
  // a dead coupon — leaves the button live, because a click that explains
  // what is missing is more use than a button that silently will not press.
  btn.disabled = placing || quoting || !quote;
  btn.textContent = placing ? 'Placing…'
    : quoting ? 'Working out the total…'
      : t && t.deliveryTaka !== null ? `Place order — ৳ ${money(t.totalTaka)}`
        : 'Place order';
}

/**
 * The ways this district can be reached, when there is more than one.
 *
 * Drawn from the server's list for the district rather than from one of our
 * own — "express is Dhaka-only" is OrderService's rule, and a second copy of
 * it here is how the form ends up offering a service the order then ignores.
 */
function paintDelivery(d) {
  const wrap = document.querySelector('[data-entry-delivery]');
  const options = d?.options || [];

  wrap.hidden = options.length < 2;
  if (options.length < 2) return;

  document.querySelector('[data-entry-delivery-options]').innerHTML = options.map((o) => `
    <label class="apane__row">
      <input type="radio" name="delivery" value="${escapeHtml(o.id)}"${o.id === d.chosen?.id ? ' checked' : ''}>
      <span><strong>${escapeHtml(o.label)}</strong> — ৳ ${money(o.cost)}
        <span class="atable__sub">${escapeHtml(o.eta)}</span></span>
    </label>`).join('');
}

/* ---- Has this number ordered before? ----------------------------------- */

/**
 * What the shop already knows about the number being typed.
 *
 * No new endpoint: this is the orders list's own search, which any account
 * that may see orders may already run. It answers the three things worth
 * knowing before the order is placed — is this a returning customer (so their
 * address need not be asked for again), do they already have an order on its
 * way (so this call may be about THAT order), and how did the last few go.
 *
 * A convenience, and it fails as one: any error leaves the box empty and the
 * form exactly as usable as it was.
 */
async function lookUp() {
  const box = document.querySelector('[data-entry-known]');
  const mine = ++knownToken;
  const phone = localPhone(form.phone.value);

  if (!PHONE.test(phone)) {
    box.hidden = true;
    return;
  }

  let found;
  try {
    found = await adminFetch(`/orders?${new URLSearchParams({ q: phone, perPage: '10' })}`);
  } catch {
    if (mine === knownToken) box.hidden = true;
    return;
  }
  if (mine !== knownToken) return;

  // The search is a LIKE across number, name and order number; only an exact
  // match on the phone is this customer.
  const theirs = found.data.filter((o) => o.customerPhone === phone);

  if (!theirs.length) {
    box.hidden = true;
    return;
  }

  const latest = theirs[0];
  const open = theirs.filter((o) => IN_PROGRESS.includes(o.status));
  const bad = theirs.filter((o) => WENT_BADLY.includes(o.status));
  const count = theirs.length >= 10 ? '10 or more orders' : `${theirs.length} order${theirs.length === 1 ? '' : 's'}`;

  box.hidden = false;
  box.innerHTML = `
    <p><strong>${escapeHtml(latest.customerName)}</strong> has ordered before — ${count} on this number.
      Latest: ${orderLink(latest)} · ${pill(latest.status)} · ৳ ${money(latest.totalTaka)}</p>
    ${open.length ? `<p class="aentry__known-warn">Already has ${open.length === 1 ? 'an order' : `${open.length} orders`}
      on the way: ${open.map((o) => `${orderLink(o)} (${escapeHtml(stageLabel(o.status))}, ৳ ${money(o.totalTaka)})`).join(', ')}.
      Make sure this call is not about ${open.length === 1 ? 'that one' : 'one of those'}.</p>` : ''}
    ${bad.length ? `<p class="aentry__known-warn">${bad.length} of their last ${theirs.length}
      ${bad.length === 1 ? 'was' : 'were'} returned, cancelled or marked spam.</p>` : ''}
    <button type="button" class="akv__edit" data-known-use="${escapeHtml(theirs.slice(0, 5).map((o) => o.orderNumber).join(','))}"
            data-known-name="${escapeHtml(latest.customerName)}">Use their name and last address</button>`;
}

/** Fill the name and address from their latest order. Always an explicit click. */
async function useKnown(btn) {
  form.name.value = btn.dataset.knownName;
  btn.disabled = true;

  // Their last address is the last one they GAVE, which is not always on
  // their last order: the express checkout and this form both let an order be
  // placed with the street still to come. So walk back through their recent
  // orders, newest first, to the first that has one — and keep the newest for
  // its district if none does.
  let past = null;
  try {
    for (const no of btn.dataset.knownUse.split(',')) {
      const { data } = await adminFetch(`/orders/${encodeURIComponent(no)}`);
      past ??= data;
      if (String(data.delivery?.address || '').trim()) {
        past = data;
        break;
      }
    }
  } catch (err) {
    btn.disabled = false;
    return toast(err.message, false);
  }

  const d = past.delivery || {};
  form.address.value = d.address || '';
  form.area.value = d.area || '';

  // The order carries the district's NAME (a snapshot), and the select is
  // keyed by its slug. Matched by name; a district that has since been
  // renamed simply is not filled, and the select still says "Choose…".
  const match = districts.find((x) => same(x.name, d.district));
  if (match) {
    form.district.value = match.key;
    delivery = null;
    requote();
  }

  btn.disabled = false;
  toast(`Filled from ${past.orderNumber}. Check it with them — people move.`);
}

/* ---- Placing ----------------------------------------------------------- */

/**
 * The first thing wrong with the form, as [sentence, field] — or null.
 *
 * The server checks all of this again and is the authority. These are here so
 * the commonest slips do not cost a round trip while somebody waits on the
 * line, and they say the same thing in the same words.
 */
function firstProblem() {
  const phone = localPhone(form.phone.value);
  const address = form.address.value.trim();

  if (!lines.length) return ['Add at least one product to the order.', document.querySelector('.ppick__input')];
  if (!PHONE.test(phone)) return ['Enter a valid Bangladeshi mobile number, e.g. 01712345678.', form.phone];
  if (form.name.value.trim().length < 3) return ['Whose order is this? Enter the customer’s name.', form.name];
  if (!form.district.value) return ['Choose the district so delivery can be priced.', form.district];
  if (address && address.length < 6) {
    return ['That address is too short to find a house with. Leave it empty to add it later.', form.address];
  }
  if (quote?.promo?.problem) return [`${quote.promo.problem} Fix the code or clear it.`, form.promo];

  return null;
}

async function place(e) {
  e.preventDefault();

  // The button is disabled for all three, but a form can be submitted without
  // its button, and placing an order twice texts a customer twice.
  if (placing || quoting || !quote) return;

  const problem = firstProblem();
  if (problem) return fail(...problem);

  placing = true;
  paintSummary();

  let placed;
  try {
    ({ data: placed } = await adminFetch('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...quotePayload(),
        name: form.name.value.trim(),
        phone: localPhone(form.phone.value),
        address: form.address.value.trim() || null,
        area: form.area.value.trim() || null,
        notes: form.notes.value.trim() || null,
        channel: form.channel.value,
        confirmed: form.confirmed.checked,
      }),
    }));
  } catch (err) {
    placing = false;
    paintSummary();

    // A request that never completed is the one failure that cannot be
    // retried blind: the order may well have been written before the
    // connection went. Say so, rather than inviting the second click.
    if (!err.status) {
      return fail('The connection dropped before the server answered. Look for this order on the '
        + 'Orders list before placing it again — it may have gone through.');
    }
    return fail(unreachable(err) || err.message);
  }

  placing = false;
  showDone(placed);
}

function showDone(placed) {
  const orders = placed.orders || [];
  const numbers = orders.map((o) => o.orderNumber);

  document.querySelector('[data-done-title]').textContent = orders.length > 1
    ? 'Placed as two orders'
    : `${placed.orderNumber} placed`;

  document.querySelector('[data-done-orders]').innerHTML = orders.map((o) => `
    <li>
      ${orderLink(o, false)} ${pill(o.status)}
      <strong>৳ ${money(o.totalTaka)}</strong>
      ${o.shipsOn ? `<span class="atable__sub">pre-order · ships when stock lands on ${escapeHtml(day(o.shipsOn))}</span>` : ''}
    </li>`).join('');

  const warning = document.querySelector('[data-done-warning]');
  warning.hidden = !placed.warning;
  warning.textContent = placed.warning || '';

  // Every slip in one tab, already asking to print — the same link the bulk
  // bar on the orders list builds.
  document.querySelector('[data-done-slip]').href =
    `/admin/slip?no=${numbers.map(encodeURIComponent).join(',')}&auto=1`;
  document.querySelector('[data-done-slip]').textContent = numbers.length > 1 ? `Print ${numbers.length} slips` : 'Print slip';
  document.querySelector('[data-done-open]').href = `/admin/order?no=${encodeURIComponent(placed.orderNumber)}`;

  form.hidden = true;
  const done = document.querySelector('[data-entry-done]');
  done.hidden = false;
  done.scrollIntoView({ behavior: 'smooth', block: 'start' });
  done.focus({ preventScroll: true });
}

/** A clean form for the next call, on the channel the last one came in on. */
function startAgain() {
  const channel = form.channel.value;

  lines = [];
  quote = null;
  quoteProblem = null;
  delivery = null;
  knownToken++;

  form.reset();
  form.channel.value = channel;

  document.querySelector('[data-entry-known]').hidden = true;
  document.querySelector('[data-entry-payhint]').hidden = true;
  document.querySelector('[data-entry-done]').hidden = true;
  form.hidden = false;

  paintLines();
  paintSummary();
  window.scrollTo({ top: 0 });
  picker.focus();
}

/**
 * Brought to the person who pressed the button, and to the field it is about.
 * An error slot that only unhides, somewhere below a long form, reads as the
 * button having done nothing — see fail() in order-detail-page.js.
 */
function fail(message, field) {
  const el = document.querySelector('[data-entry-error]');
  el.textContent = message;
  el.hidden = false;

  if (field) {
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus({ preventScroll: true });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/* ---- Small things ------------------------------------------------------ */

/** 01712345678, from however it was typed: spaces, dashes and a +88 removed. */
function localPhone(raw) {
  const tidy = String(raw || '').replace(/[\s\-().]/g, '');
  return PHONE.test(tidy) ? tidy.replace(/^\+?88/, '') : tidy;
}

/** The same word, whatever its case or spacing — and null equals null. */
function same(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

function orderLink(o, newTab = true) {
  return `<a href="/admin/order?no=${encodeURIComponent(o.orderNumber)}"${
    newTab ? ' target="_blank" rel="noopener"' : ''}>${escapeHtml(o.orderNumber)}</a>`;
}

function pill(status) {
  return `<span class="apill apill--label apill--${stageTone(status)}">${escapeHtml(stageLabel(status))}</span>`;
}

const money = (n) => Number(n || 0).toLocaleString('en-BD');

function day(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
