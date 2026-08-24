/**
 * track-page.js — order tracking with a status timeline.
 *
 * WHERE THE ORDER COMES FROM, AND WHY IT CHANGED
 * This page used to look an order up in localStorage MERGED WITH the fixture
 * in data/orders.json, unconditionally. Two things fell out of that:
 *
 *  - The fixture is three fully-populated orders, and the lookup box's own
 *    placeholder names one of them. Anyone who tapped the field and typed the
 *    example was shown a delivered order, its contents, its total and the
 *    street address it shipped to. On a public page, to a stranger.
 *  - The genuine case failed. A customer who ordered on their phone and tracks
 *    from a desktop, or who cleared their site data, had nothing in
 *    localStorage and was told "Order not found" — while
 *    GET /api/orders/{number}?phone= existed the whole time for exactly this.
 *
 * So: the server first, with the order number and the phone that placed it,
 * which is the credential OrderController::show() checks. localStorage second,
 * because it holds only what THIS device ordered. The fixture, not at all.
 */
import { deliveryOption } from '../delivery/backend/api.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { getParam } from '../../shared/js/core/router-helpers.js';
import { statusBadge } from './account-common.js';

const STAGES = ['Order placed', 'Processing', 'Shipped', 'Out for delivery', 'Delivered'];
// Map an order status to the furthest reached stage index.
const STATUS_STAGE = { processing: 1, shipped: 2, delivered: 4 };

const resultEl = document.querySelector('[data-track-result]');
const emptyEl = document.querySelector('[data-track-empty]');
const form = document.querySelector('[data-track-lookup]');
const input = document.querySelector('[data-track-input]');
const phoneInput = document.querySelector('[data-track-phone]');

/** Only what this browser placed. Never a fixture. */
let mine = [];

init();

function init() {
  mine = storage.get(KEYS.ORDERS, []);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    track(input.value.trim(), phoneInput?.value.trim() || '');
  });

  // The confirmation page links here with ?id= and no phone, from the device
  // that just ordered — so the local history is the right answer for it.
  const id = getParam('id');
  if (id) { input.value = id; track(id, ''); }
}

async function track(id, phone) {
  if (!id) return;

  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Looking…'; }

  const order = await lookup(id, phone);

  if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Track'; }

  if (!order) { resultEl.hidden = true; emptyEl.hidden = false; return; }
  emptyEl.hidden = true;
  resultEl.hidden = false;
  render(order);
}

/** The server when we hold the credential; this device's own history if not. */
async function lookup(id, phone) {
  if (phone) {
    const remote = await fetchOrder(id, phone);
    if (remote) return remote;
  }
  return mine.find((o) => String(o.id).toLowerCase() === id.toLowerCase()) || null;
}

async function fetchOrder(id, phone) {
  try {
    const res = await fetch(
      `/api/orders/${encodeURIComponent(id)}?phone=${encodeURIComponent(phone)}`,
      { headers: { Accept: 'application/json' }, credentials: 'same-origin' }
    );
    // A wrong phone and a non-existent order both answer 404, deliberately —
    // see the note in OrderController::show(). Nothing to tell apart here.
    if (!res.ok) return null;
    return (await res.json()).data ?? null;
  } catch {
    // Offline, or no backend. Fall through to what this device remembers.
    return null;
  }
}

function render(o) {
  document.querySelector('[data-track-id]').textContent = o.id;
  document.querySelector('[data-track-date]').textContent = `Placed ${o.date}`;
  document.querySelector('[data-track-status]').innerHTML = statusBadge(o.status);
  document.querySelector('[data-track-address]').textContent = o.address || '—';
  // Quote the ETA for the zone actually chosen, not a generic range. Orders
  // from the mock history predate zones, so fall back to the metro rate.
  document.querySelector('[data-track-eta]').textContent =
    o.status === 'delivered' ? 'Delivered' : deliveryOption(o.delivery).eta;

  const reached = o.status === 'cancelled' ? -1 : (STATUS_STAGE[o.status] ?? 0);
  const timeline = document.querySelector('[data-timeline]');

  if (o.status === 'cancelled') {
    timeline.innerHTML = `
      <li class="timeline__step is-cancelled">
        <span class="timeline__dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M18 6 6 18M6 6l12 12"/></svg></span>
        <div><div class="timeline__title">Order cancelled</div><div class="timeline__meta">This order was cancelled.</div></div>
      </li>`;
  } else {
    timeline.innerHTML = STAGES.map((label, i) => {
      const state = i < reached ? 'is-done' : i === reached ? 'is-current' : '';
      const icon = i <= reached
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" width="15" height="15"><path d="M20 6 9 17l-5-5"/></svg>'
        : `<span style="font-size:12px">${i + 1}</span>`;
      const meta = i === reached ? 'In progress' : i < reached ? 'Completed' : 'Pending';
      return `<li class="timeline__step ${state}"><span class="timeline__dot">${icon}</span><div><div class="timeline__title">${label}</div><div class="timeline__meta">${meta}</div></div></li>`;
    }).join('');
  }

  document.querySelector('[data-track-items]').innerHTML = o.items.map((it) => `
    <div class="order-item-row"><img src="${it.image}" alt=""><span style="flex:1">${escapeHtml(it.title)}</span><span class="caption">×${it.qty}</span><span class="tabular caption">${formatBDT(it.price * it.qty)}</span></div>`).join('')
    + `<div class="order-item-row" style="border-top:1px solid var(--border-hairline);margin-top:.5rem;padding-top:.75rem"><span style="flex:1;font-weight:600">Total</span><strong class="tabular">${formatBDT(o.total)}</strong></div>`;
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
