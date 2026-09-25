/**
 * order-detail-page.js — one order: items, money, history, notes, transitions,
 * refunds.
 *
 * The buttons drawn here come from `allowedTransitions` in the payload, which
 * the server computes from the same map it enforces. Nothing about what is
 * legal is decided in this file — a browser that disagreed with the server
 * about whether an order can go from delivered back to packed would be a bug
 * that only shows up as a confusing error.
 *
 * THREE RECORDS, THREE CARDS, NEVER MERGED
 * ----------------------------------------
 * History is what HAPPENED — written by the server, never by a person.
 * Notes are what we THINK — internal, staff-written, and never sent anywhere.
 * Messages are what we TOLD the customer — mounted by modules/sms, and the only
 * one of the three that leaves the building.
 *
 * Collapsing them into one pretty timeline was tempting and would have been a
 * mistake: the whole value of a note like "customer sounded evasive, verify
 * address" is that it is impossible to confuse with something the customer was
 * sent.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { canDelete, confirmDelete, toast } from './admin-delete.js';
import { thumb } from './admin-thumb.js';
import { TRANSITION_LABELS, NEEDS_REASON, stageLabel } from './order-stages.js';

let order = null;

document.addEventListener('admin:ready', load);

function orderNumber() {
  return new URLSearchParams(location.search).get('no');
}

async function load() {
  const no = orderNumber();
  if (!no) return fail('No order number in the URL.');

  try {
    ({ data: order } = await adminFetch(`/orders/${encodeURIComponent(no)}`));
  } catch (err) {
    return fail(err.status === 404 || !err.status
      ? 'No backend connected yet — this screen fills in once the API is live.'
      : err.message);
  }

  paintHeader();
  paintItems();
  paintCustomer();
  paintHistory();
  paintNotes();
  paintRefunds();
  paintActions();

  // Wired once. Everything above may repaint; this form never does.
  document.querySelector('[data-note-form]')?.addEventListener('submit', submitNote);
}

function paintHeader() {
  document.querySelector('[data-order-number]').textContent = order.orderNumber;
  // Which ad sold it belongs in the header line: for a shop acquiring through
  // paid social, campaign-or-organic is as much a fact of the order as how it
  // was paid. utm_campaign names the ad set; utm_source alone still says
  // where; nothing means the customer found the shop themselves.
  const ad = order.adSource
    ? ` · via ${order.adSource.utm_campaign || order.adSource.utm_source || 'ad'}`
    : '';
  document.querySelector('[data-order-meta]').textContent =
    `${stageLabel(order.status)} · ${order.paymentStatus} via ${order.paymentMethod} · placed ${when(order.placedAt)}${ad}`;
  document.title = `${order.orderNumber} — GulfRabit Admin`;

  // Stated outright, because everything else on this screen still looks like a
  // working order — the items are there, the totals are there, the timeline is
  // there. Only the actions differ, and a difference is not an explanation.
  const banner = document.querySelector('[data-order-deleted]');
  if (banner) {
    /* Two reasons this screen needs a banner, and deleted outranks pre-order:
       an order that has been removed is the more surprising fact, and stacking
       two banners teaches people to skip both. */
    if (order.deletedAt) {
      banner.hidden = false;
      banner.className = 'abanner abanner--deleted';
      banner.textContent =
        `This order was deleted on ${when(order.deletedAt)}. It does not appear in any list, `
        + 'count or dashboard figure. Nothing about it has been destroyed.';
    } else if (order.shipsOn) {
      const day = new Date(`${order.shipsOn}T00:00:00`)
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

      banner.hidden = false;
      banner.className = `abanner abanner--${order.preorderDue ? 'due' : 'wait'}`;
      // Not blocking the stage buttons, deliberately. Stock arrives early, a
      // supplier ships in two parts, and a merchant who has the goods in hand
      // should not be argued with by a date typed in three weeks ago. The
      // banner is the reminder; the decision stays theirs.
      banner.textContent = order.preorderDue
        ? `Pre-order — the shipment was due ${day}. If it has landed, this can be packed.`
        : `Pre-order — cannot be packed until the shipment lands on ${day}.`;
    } else {
      banner.hidden = true;
      banner.textContent = '';
    }
  }
}

/**
 * One purchased line: the photograph, the name, and the two facts a person
 * packing the box needs that this screen has never shown.
 *
 * EVERYTHING HERE EXCEPT THE LINK IS THE SNAPSHOT
 * ----------------------------------------------
 * `title`, `brand` and `image` are what was bought, as it was on the day. The
 * catalogue may have renamed the product, re-shot it, or dropped it entirely;
 * an order is a historical record and none of that may rewrite it. Those three
 * columns have been on `order_items` since the table was created for exactly
 * this reason — the panel simply never asked the API for two of them.
 *
 * The link is the one part that is about today, which is why it is drawn from
 * `productExists` rather than from the sku alone. A sku is snapshotted and
 * survives the product; linking on it would put a dead link on the line of
 * every order containing something the shop has since removed — and the person
 * clicking it is mid-pack, not in the mood to debug a 404.
 *
 * `productExists` is absent from an older payload, which reads as false and
 * gives plain text. The same is true of `image`: no photograph and a stale
 * backend both land on the lettered tile, which is a designed state either way.
 */
function itemIdent(i) {
  const name = escapeHtml(i.title);

  // 'unknown' is the sentinel OrderService writes when the product had already
  // been deleted at checkout, not a sku anybody can read off a shelf label.
  const sku = i.sku && i.sku !== 'unknown' ? i.sku : null;

  const meta = [
    i.brand ? escapeHtml(i.brand) : null,
    sku ? `<span class="aitem__sku">${escapeHtml(sku)}</span>` : null,
  ].filter(Boolean).join(' · ');

  return `
    <div class="aitem">
      ${thumb(i.image, i.title)}
      <div class="aitem__ident">
        <div class="aitem__title">${
          i.productExists && sku
            ? `<a href="/admin/products/edit?sku=${encodeURIComponent(sku)}">${name}</a>`
            : name
        }</div>
        ${meta ? `<div class="atable__sub">${meta}</div>` : ''}
        ${i.variant ? `<div class="atable__sub">${escapeHtml(i.variant)}</div>` : ''}
      </div>
    </div>`;
}

function paintItems() {
  document.querySelector('[data-order-items]').innerHTML = order.items.map((i) => `
    <tr>
      <td>${itemIdent(i)}</td>
      <td class="atable__num">${i.qty}</td>
      <td class="atable__num">৳ ${money(i.unitTaka)}</td>
      <td class="atable__num">৳ ${money(i.lineTaka)}</td>
    </tr>`).join('');

  const t = order.totals;
  const rows = [
    ['Subtotal', t.subtotalTaka],
    ...(t.discountTaka ? [['Discount' + (order.promoCode ? ` (${order.promoCode})` : ''), -t.discountTaka]] : []),
    ['Delivery', t.deliveryTaka],
    ['Total', t.totalTaka],
    // Only shown once money has actually gone back, so a clean order does not
    // carry a row of zeroes implying something happened.
    ...(t.refundedTaka ? [['Refunded', -t.refundedTaka]] : []),
  ];
  document.querySelector('[data-order-totals]').innerHTML = rows.map(([label, value], i) => `
    <div class="atotals__row${i === rows.length - 1 && !t.refundedTaka ? ' is-total' : ''}">
      <dt>${escapeHtml(label)}</dt><dd>৳ ${money(value)}</dd>
    </div>`).join('');
}

function paintCustomer() {
  const c = order.customer;
  const d = order.delivery;
  const row = ([k, v]) => `
    <div class="akv__row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`;

  document.querySelector('[data-order-customer]').innerHTML =
    [['Name', c.name], ['Phone', c.phone], ['Email', c.email || '—']].map(row).join('')
    + addressBlock()
    + [
      ['District', d.district],
      ['Delivery', `${d.zone} · ${d.eta} · ৳ ${money(d.chargeTaka)}`],
      ['Notes', d.notes || '—'],
    ].map(row).join('');

  wireAddress();
}

/**
 * The address, and the one place on this screen somebody types while holding
 * a phone.
 *
 * Express asks for a name, a phone and a district and stops; the rest is
 * settled on the confirmation call. So an order can legitimately arrive here
 * with no street address, and the person who rings needs somewhere to write
 * down what they are told. Before this there was nowhere — a note is free text
 * that the packing slip never reads.
 *
 * MISSING IS SHOWN AS MISSING. An empty address rendered as a blank row, which
 * on a screen full of blank-ish rows reads as a page that failed to load
 * rather than as a job to do. It now says what it is and what to do about it,
 * because the whole point of the shorter checkout is that somebody finishes
 * the order on the phone.
 *
 * The district is deliberately not in the form: it sets the delivery charge
 * the customer has already agreed to, and moving it here would change what the
 * order is worth as a side effect of a typing correction.
 */
function addressBlock() {
  const d = order.delivery;
  const missing = !String(d.address || '').trim();

  return `
    <div class="akv__row">
      <dt>Address</dt>
      <dd>
        ${missing
          ? '<span class="akv__missing">Not recorded yet — ask when you call</span>'
          : escapeHtml(String(d.address))}
        ${order.canEditAddress
          ? `<button type="button" class="akv__edit" data-address-edit>${missing ? 'Add' : 'Edit'}</button>`
          : ''}
      </dd>
    </div>
    ${row2('Area', d.area || '—')}
    ${order.canEditAddress ? `
    <form class="akv__form" data-address-form hidden>
      <label class="label-gr" for="od-address">Street address</label>
      <input class="input-gr" id="od-address" name="address" autocomplete="off"
             value="${escapeHtml(String(d.address || ''))}" placeholder="House, road, block">
      <label class="label-gr" for="od-area">Thana / Upazila</label>
      <input class="input-gr" id="od-area" name="area" autocomplete="off"
             value="${escapeHtml(String(d.area || ''))}" placeholder="e.g. Gulshan">
      <p class="akv__hint">
        ${escapeHtml(d.district)} stays as it is — the district sets the delivery
        charge the customer already agreed to. The change is recorded in the timeline.
      </p>
      <div class="akv__formactions">
        <button class="btn-gr btn-primary-gr btn-sm-gr" type="submit">Save address</button>
        <button class="btn-gr btn-outline-gr btn-sm-gr" type="button" data-address-cancel>Cancel</button>
      </div>
    </form>` : ''}`;
}

function row2(k, v) {
  return `<div class="akv__row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`;
}

function wireAddress() {
  const form = document.querySelector('[data-address-form]');
  if (!form) return;
  const open = (on) => {
    form.hidden = !on;
    if (on) form.querySelector('[name="address"]').focus();
  };
  document.querySelector('[data-address-edit]')?.addEventListener('click', () => open(true));
  form.querySelector('[data-address-cancel]').addEventListener('click', () => open(false));
  form.addEventListener('submit', saveAddress);
}

async function saveAddress(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const address = form.address.value.trim();
  const area = form.area.value.trim();

  // The server says the same thing, in the same words. This is here so the
  // common mistake does not cost a round trip while somebody is on a call.
  if (address.length < 6) return fail('That is too short to find a house with.');

  btn.disabled = true;
  let saved;
  try {
    ({ data: saved } = await adminFetch(`/orders/${encodeURIComponent(order.orderNumber)}/address`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, area: area || null }),
    }));
  } catch (err) {
    btn.disabled = false;
    return fail(err.message);
  }

  /* The server is the authority on what the order now says. It returns the
     same `delivery` block show() sent, so this repaints from its answer rather
     than patching the local copy and hoping the two still agree.

     `note` is null when nothing actually changed — somebody opened the form,
     thought better of it and pressed Save. Nothing is appended in that case,
     because the timeline should not record a decision not to make one. */
  order.delivery = saved.delivery;
  if (saved.note) {
    order.notes.push(saved.note);
    paintNotes();
  }

  btn.disabled = false;
  paintCustomer();
  toast(saved.note ? 'Address saved.' : 'No change to save.');
}

function paintHistory() {
  const host = document.querySelector('[data-order-history]');
  if (!order.history.length) {
    host.innerHTML = '<li class="atimeline__empty">No recorded changes yet.</li>';
    return;
  }
  host.innerHTML = order.history.map((e) => `
    <li class="atimeline__item">
      <div class="atimeline__what">
        ${e.from ? `${escapeHtml(stageLabel(e.from))} → ` : ''}<strong>${escapeHtml(stageLabel(e.to))}</strong>
      </div>
      <div class="atimeline__who">${escapeHtml(e.actor)} · ${when(e.at)}</div>
      ${e.note ? `<div class="atimeline__note">${escapeHtml(e.note)}</div>` : ''}
    </li>`).join('');
}

/**
 * Internal notes: the record of what staff know that the order itself does not
 * say. Append-only — there is no edit and no delete, matching the server.
 *
 * Only the list is redrawn here. The form is wired once, in load(), because
 * this function runs again after every save and a listener re-attached each
 * time would post the next note twice.
 */
function paintNotes() {
  const host = document.querySelector('[data-order-notes]');
  if (!host) return;

  // Deployed but not migrated. Say which command is missing rather than showing
  // a form that would 500 on submit — this is a two-minute window on the day of
  // a deploy, and it should read as "one step left", not as a broken screen.
  if (order.notesReady === false) {
    host.innerHTML = `<li class="atimeline__empty">
      Notes need their table. Run <code>php artisan migrate</code> on the server.
    </li>`;
    const form = document.querySelector('[data-note-form]');
    if (form) form.hidden = true;
    return;
  }

  host.innerHTML = order.notes.length
    ? order.notes.map((n) => `
        <li class="anote">
          <div class="anote__body">${escapeHtml(n.body)}</div>
          <div class="atable__sub">${escapeHtml(n.author)} · ${when(n.at)}</div>
        </li>`).join('')
    : '<li class="atimeline__empty">No notes on this order yet.</li>';
}

async function submitNote(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  const body = form.body.value.trim();
  if (!body) return;

  btn.disabled = true;

  let saved;
  try {
    ({ data: saved } = await adminFetch(`/orders/${encodeURIComponent(order.orderNumber)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }));
  } catch (err) {
    btn.disabled = false;
    return fail(err.message);
  }

  // Appended in place rather than reloading. A note changes nothing else on
  // this screen, and throwing away a half-typed message in the box below it —
  // or the courier form beside it — to redraw one paragraph would be rude.
  order.notes.push(saved);
  form.reset();
  btn.disabled = false;
  paintNotes();
}

function paintRefunds() {
  const section = document.querySelector('[data-refund-section]');
  // Hidden entirely for roles that cannot refund AND orders with none. A
  // warehouse account has no business seeing a refund form it cannot submit.
  if (!order.canRefund && !order.refunds.length) return;
  section.hidden = false;

  document.querySelector('[data-order-refunds]').innerHTML = order.refunds.length
    ? order.refunds.map((r) => `
        <li class="arefund">
          <div><strong>৳ ${money(r.amountTaka)}</strong> via ${escapeHtml(r.method)}</div>
          <div class="atable__sub">${escapeHtml(r.reason)}</div>
          <div class="atable__sub">${escapeHtml(r.by)} · ${when(r.at)}${r.reference ? ` · ref ${escapeHtml(r.reference)}` : ''}</div>
        </li>`).join('')
    : '<li class="atable__sub">No refunds on this order.</li>';

  if (!order.canRefund) return;

  const form = document.querySelector('[data-refund-form]');
  const refundable = order.totals.refundableTaka;

  if (refundable <= 0) {
    document.querySelector('[data-refundable]').textContent =
      'Nothing left to refund on this order.';
    document.querySelector('[data-refundable]').hidden = false;
    return;
  }

  form.hidden = false;
  form.querySelector('[data-refundable]').textContent = `৳ ${money(refundable)} still refundable.`;
  form.amountTaka.max = refundable;
  form.addEventListener('submit', submitRefund);
}

async function submitRefund(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    await adminFetch(`/orders/${encodeURIComponent(order.orderNumber)}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountTaka: Number(form.amountTaka.value),
        method: form.method.value,
        reason: form.reason.value.trim(),
      }),
    });
  } catch (err) {
    btn.disabled = false;
    return fail(err.message);
  }

  // Reload rather than patching the DOM: a refund changes the refundable
  // balance, the payment status and the totals, and re-deriving all of that in
  // the browser is how the screen starts disagreeing with the database.
  location.reload();
}

function paintActions() {
  const host = document.querySelector('[data-order-actions]');

  // The slip comes first and is drawn whatever stage the order is in —
  // including the terminal ones, which used to return early from here. A
  // reprint is wanted most often for an order that has already shipped, so
  // hiding the button on exactly those orders had it backwards.
  const slip = `
    <a class="btn-gr btn-outline-gr btn-sm-gr"
       href="/admin/slip?no=${encodeURIComponent(order.orderNumber)}" target="_blank" rel="noopener">
      Print slip
    </a>`;

  // A deleted order shows one control and no stage moves. The server already
  // sends it no transitions; this is about not also offering a reprint, which
  // would put a slip for an order that is off the floor into somebody's hand.
  if (order.deletedAt) {
    host.innerHTML = canDelete('orders')
      ? `<button class="btn-gr btn-primary-gr btn-sm-gr" type="button" data-restore>Restore this order</button>
         <span class="admin__sub">Deleted ${escapeHtml(when(order.deletedAt))}. Restoring puts it back in ${
           escapeHtml(stageLabel(order.status).toLowerCase())
         }.</span>`
      : `<span class="admin__sub">This order was deleted ${escapeHtml(when(order.deletedAt))}. Only an owner can restore it.</span>`;

    host.querySelector('[data-restore]')?.addEventListener('click', (e) => restore(e.currentTarget));
    return;
  }

  // Delete is drawn last, after the moves and after the slip — the far end of
  // the row from "Confirm", which is the button the hand goes to a hundred
  // times a day.
  const del = canDelete('orders')
    ? '<button class="btn-gr btn-danger-gr btn-sm-gr" type="button" data-delete>Delete order</button>'
    : '';

  if (!order.allowedTransitions.length) {
    host.innerHTML = slip
      + `<span class="admin__sub">No further changes possible from ${escapeHtml(stageLabel(order.status))}.</span>`
      + del;
  } else {
    // The ending moves get the quieter button. Both are one click away, but the
    // one that carries the order forward is the one the eye lands on — which is
    // the right default a hundred times a day.
    host.innerHTML = slip + order.allowedTransitions.map((to) => `
      <button class="btn-gr ${NEEDS_REASON.includes(to) ? 'btn-outline-gr' : 'btn-primary-gr'} btn-sm-gr"
              type="button" data-transition="${escapeHtml(to)}">
        ${escapeHtml(TRANSITION_LABELS[to] || to)}
      </button>`).join('') + del;
  }

  host.querySelectorAll('[data-transition]').forEach((btn) => {
    btn.addEventListener('click', () => transition(btn.dataset.transition, btn));
  });
  host.querySelector('[data-delete]')?.addEventListener('click', (e) => remove(e.currentTarget));
}

/* ---- Deleting -----------------------------------------------------------
   The same act as the row menu on the orders list, asked the same way. The
   difference is that here the whole order is on screen while it is asked, so
   the dialog can be shorter and still be understood. */

async function remove(btn) {
  const ok = await confirmDelete({
    title: `Delete ${order.orderNumber}?`,
    // The books are the part people do not expect, so it is the part that gets
    // said. Deleting never reverses a posted sale — that is a deliberate act
    // on the Journal screen, or it does not happen.
    body: order.paymentStatus === 'paid'
      ? 'This order has been paid and posted. Deleting it does not reverse the sale in the books '
        + 'or put its stock back — do those on the Journal and Stock screens if you need them.'
      : 'It leaves every list and every count. Items, timeline, notes and refunds stay with it.',
    confirm: 'Delete order',
  });
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = 'Deleting…';

  try {
    const { message } = await adminFetch(`/orders/${encodeURIComponent(order.orderNumber)}`, { method: 'DELETE' });
    toast(message || `${order.orderNumber} deleted.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Delete order';
    return toast(err.message, false);
  }

  // Reload rather than repaint: deleting changes the actions, the banner and
  // the timeline all at once, and re-deriving that here is how this screen
  // starts disagreeing with the database.
  location.reload();
}

async function restore(btn) {
  btn.disabled = true;
  btn.textContent = 'Restoring…';

  try {
    const { message } = await adminFetch(
      `/orders/${encodeURIComponent(order.orderNumber)}/restore`, { method: 'POST' });
    toast(message || `${order.orderNumber} restored.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Restore this order';
    return toast(err.message, false);
  }

  location.reload();
}


async function transition(to, btn) {
  // Cancelling, returning and marking spam are the moves that cost money,
  // annoy a customer, or remove an order from every figure the business is
  // judged on — and they are the ones a mis-click lands on. Ask, and take the
  // reason while we are asking: the note is the only record of why.
  let note = null;
  if (NEEDS_REASON.includes(to)) {
    note = prompt(
      `Why is this order being marked ${stageLabel(to).toLowerCase()}? (recorded against your name)`
    );
    if (note === null) return;
    if (!note.trim()) return fail(`A reason is required to mark an order ${stageLabel(to).toLowerCase()}.`);
  }

  btn.disabled = true;
  try {
    await adminFetch(`/orders/${encodeURIComponent(order.orderNumber)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, note }),
    });
  } catch (err) {
    btn.disabled = false;
    return fail(err.message);
  }
  location.reload();
}

function fail(message) {
  const el = document.querySelector('[data-order-error]');
  el.textContent = message;
  el.hidden = false;

  // Brought to the person who pressed the button, not just unhidden somewhere
  // below them. See the note on fail() in product-edit-page.js: an error slot
  // further down the page than the control that triggered it reads as the
  // button having done nothing at all.
  el.tabIndex = -1;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}

const money = (n) => Number(n).toLocaleString('en-BD');
function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
