/**
 * account-page.js — dashboard overview: greeting, stat counts, recent order.
 */
import * as store from '../../shared/js/core/state.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { ensureSession, wireLogout, statusBadge } from './account-common.js';

const user = ensureSession();
wireLogout();

document.querySelector('[data-greeting]').textContent = `Welcome, ${user.name.split(' ')[0]}`;

const orders = storage.get(KEYS.ORDERS, []);
setText('[data-stat-orders]', orders.length);
setText('[data-stat-wishlist]', store.wishlistCount());
setText('[data-stat-addresses]', (user.addresses || []).length);

const recent = orders[0];
if (recent) {
  document.querySelector('[data-recent-order]').innerHTML = `
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem">
      <strong>${recent.id}</strong>${statusBadge(recent.status)}
    </div>
    ${recent.items.map((it) => `<div class="order-item-row"><img src="${it.image}" alt=""><span style="flex:1">${escapeHtml(it.title)}</span><span class="caption">×${it.qty}</span></div>`).join('')}
    <div style="display:flex;justify-content:space-between;margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--gr-border)">
      <span class="text-muted-gr">${recent.date}</span><strong class="tabular">${formatBDT(recent.total)}</strong>
    </div>`;
}

function setText(sel, v) { const el = document.querySelector(sel); if (el) el.textContent = v; }
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
