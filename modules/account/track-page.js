/**
 * track-page.js — order tracking with a status timeline.
 * Looks up an order by ?id= (or the lookup field) from the local order history
 * merged with the mock orders.json, and renders a stage timeline.
 */
import { getMockOrders } from '../../shared/js/core/data-service.js';
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

let orders = [];

init();

async function init() {
  const local = storage.get(KEYS.ORDERS, []);
  const mock = await getMockOrders().catch(() => []);
  const seen = new Set();
  orders = [...local, ...mock].filter((o) => (seen.has(o.id) ? false : seen.add(o.id)));

  form.addEventListener('submit', (e) => { e.preventDefault(); track(input.value.trim()); });

  const id = getParam('id');
  if (id) { input.value = id; track(id); }
}

function track(id) {
  if (!id) return;
  const order = orders.find((o) => o.id.toLowerCase() === id.toLowerCase());
  if (!order) { resultEl.hidden = true; emptyEl.hidden = false; return; }
  emptyEl.hidden = true;
  resultEl.hidden = false;
  render(order);
}

function render(o) {
  document.querySelector('[data-track-id]').textContent = o.id;
  document.querySelector('[data-track-date]').textContent = `Placed ${o.date}`;
  document.querySelector('[data-track-status]').innerHTML = statusBadge(o.status);
  document.querySelector('[data-track-address]').textContent = o.address || '—';
  document.querySelector('[data-track-eta]').textContent = o.status === 'delivered' ? 'Delivered' : '2–5 business days';

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
    + `<div class="order-item-row" style="border-top:1px solid var(--gr-border);margin-top:.5rem;padding-top:.75rem"><span style="flex:1;font-weight:600">Total</span><strong class="tabular">${formatBDT(o.total)}</strong></div>`;
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
