/**
 * orders-page.js — order history: merges locally-placed orders (localStorage)
 * with the mock order history (orders.json), with status filters.
 */
import { getMockOrders } from '../../shared/js/core/data-service.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { ensureSession, wireLogout, statusBadge } from './account-common.js';

ensureSession();
wireLogout();

const listEl = document.querySelector('[data-orders-list]');
const emptyEl = document.querySelector('[data-orders-empty]');
let all = [];
let filter = 'all';

init();

async function init() {
  const local = storage.get(KEYS.ORDERS, []);
  const mock = await getMockOrders().catch(() => []);
  // Local orders first (newest), then mock history, de-duped by id.
  const seen = new Set();
  all = [...local, ...mock].filter((o) => (seen.has(o.id) ? false : seen.add(o.id)));

  document.querySelectorAll('[data-filter]').forEach((btn) => btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((b) => { b.classList.toggle('is-active', b === btn); b.classList.toggle('btn-outline-gr', b === btn); b.classList.toggle('btn-ghost-gr', b !== btn); });
    render();
  }));
  render();
}

function render() {
  const list = filter === 'all' ? all : all.filter((o) => o.status === filter);
  if (!list.length) { listEl.innerHTML = ''; emptyEl.hidden = false; return; }
  emptyEl.hidden = true;
  listEl.innerHTML = list.map(orderCard).join('');
}

function orderCard(o) {
  return `
    <article class="order-card surface-gr">
      <div class="order-card__head">
        <div><strong>${o.id}</strong><div class="caption">Placed ${o.date}</div></div>
        <div style="display:flex;align-items:center;gap:1rem">${statusBadge(o.status)}<strong class="tabular">${formatBDT(o.total)}</strong></div>
      </div>
      ${o.items.map((it) => `<div class="order-item-row"><img src="${it.image}" alt=""><span style="flex:1">${escapeHtml(it.title)}</span><span class="caption">×${it.qty}</span><span class="tabular caption">${formatBDT(it.price * it.qty)}</span></div>`).join('')}
      <div style="display:flex;gap:.75rem;margin-top:1rem">
        <a class="btn-gr btn-outline-gr btn-sm-gr" href="#">Track</a>
        ${o.status === 'delivered' ? '<button class="btn-gr btn-ghost-gr btn-sm-gr" type="button">Buy again</button>' : ''}
      </div>
    </article>`;
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
