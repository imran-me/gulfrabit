/**
 * confirmation-page.js — renders the just-placed order from localStorage.
 * Reads the "last-order" stash (or looks up by ?id= in local order history).
 */

import { storage, KEYS } from '../../shared/js/core/storage.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { getParam } from '../../shared/js/core/router-helpers.js';
import { siteURL } from '../../shared/js/core/paths.js';

const id = getParam('id');
let order = storage.get('last-order', null);
if (!order || (id && order.id !== id)) {
  order = (storage.get(KEYS.ORDERS, []) || []).find((o) => o.id === id) || order;
}

if (!order) {
  document.querySelector('#main').innerHTML =
    `<div class="empty-state"><h1 class="empty-state__title">No recent order</h1><p class="empty-state__text">We couldn’t find that order.</p><a class="btn-gr btn-primary-gr" href="${siteURL('index.html')}">Back to home</a></div>`;
} else {
  setText('[data-order-id]', order.id);
  setText('[data-order-address]', order.address || '—');
  setText('[data-order-total]', formatBDT(order.total));
  document.querySelector('[data-order-items]').innerHTML = order.items.map((it) => `
    <div class="cart-line" style="grid-template-columns:48px 1fr auto">
      <img class="cart-line__thumb" style="width:48px;height:48px" src="${it.image}" alt="">
      <div><div class="cart-line__title">${escapeHtml(it.title)}</div><div class="cart-line__meta">Qty ${it.qty}</div></div>
      <div class="cart-line__price">${formatBDT(it.price * it.qty)}</div>
    </div>`).join('');
}

function setText(sel, v) { const el = document.querySelector(sel); if (el) el.textContent = v; }
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
