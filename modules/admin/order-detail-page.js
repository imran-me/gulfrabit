/**
 * order-detail-page.js — one order: items, money, history, transitions, refunds.
 *
 * The buttons drawn here come from `allowedTransitions` in the payload, which
 * the server computes from the same map it enforces. Nothing about what is
 * legal is decided in this file — a browser that disagreed with the server
 * about whether an order can go from delivered back to packed would be a bug
 * that only shows up as a confusing error.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';

const TRANSITION_LABELS = {
  confirmed: 'Confirm',
  packed: 'Mark packed',
  shipped: 'Mark shipped',
  delivered: 'Mark delivered',
  cancelled: 'Cancel order',
  returned: 'Mark returned',
};

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
  paintRefunds();
  paintActions();
}

function paintHeader() {
  document.querySelector('[data-order-number]').textContent = order.orderNumber;
  document.querySelector('[data-order-meta]').textContent =
    `${order.status} · ${order.paymentStatus} via ${order.paymentMethod} · placed ${when(order.placedAt)}`;
  document.title = `${order.orderNumber} — GulfRabit Admin`;
}

function paintItems() {
  document.querySelector('[data-order-items]').innerHTML = order.items.map((i) => `
    <tr>
      <td>${escapeHtml(i.title)}${i.variant ? `<div class="atable__sub">${escapeHtml(i.variant)}</div>` : ''}</td>
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
  const pairs = [
    ['Name', c.name],
    ['Phone', c.phone],
    ['Email', c.email || '—'],
    ['Address', d.address],
    ['Area', d.area || '—'],
    ['District', d.district],
    ['Delivery', `${d.zone} · ${d.eta} · ৳ ${money(d.chargeTaka)}`],
    ['Notes', d.notes || '—'],
  ];
  document.querySelector('[data-order-customer]').innerHTML = pairs.map(([k, v]) => `
    <div class="akv__row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join('');
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
        ${e.from ? `${escapeHtml(e.from)} → ` : ''}<strong>${escapeHtml(e.to)}</strong>
      </div>
      <div class="atimeline__who">${escapeHtml(e.actor)} · ${when(e.at)}</div>
      ${e.note ? `<div class="atimeline__note">${escapeHtml(e.note)}</div>` : ''}
    </li>`).join('');
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
  if (!order.allowedTransitions.length) {
    host.innerHTML = `<span class="admin__sub">No further changes possible from ${escapeHtml(order.status)}.</span>`;
    return;
  }

  host.innerHTML = order.allowedTransitions.map((to) => `
    <button class="btn-gr ${to === 'cancelled' || to === 'returned' ? 'btn-outline-gr' : 'btn-primary-gr'} btn-sm-gr"
            type="button" data-transition="${escapeHtml(to)}">
      ${escapeHtml(TRANSITION_LABELS[to] || to)}
    </button>`).join('');

  host.querySelectorAll('[data-transition]').forEach((btn) => {
    btn.addEventListener('click', () => transition(btn.dataset.transition, btn));
  });
}

async function transition(to, btn) {
  // Cancelling and returning are the two that cost money or annoy a customer,
  // and they are the two a mis-click lands on. Ask, and take the reason while
  // we are asking — the note is the only record of why.
  let note = null;
  if (to === 'cancelled' || to === 'returned') {
    note = prompt(`Why is this order being marked ${to}? (recorded against your name)`);
    if (note === null) return;
    if (!note.trim()) return fail('A reason is required to ' + to + ' an order.');
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
}

const money = (n) => Number(n).toLocaleString('en-BD');
function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
