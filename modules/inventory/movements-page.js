/**
 * movements-page.js — the stock ledger for one product.
 *
 * Read-only. Movements are append-only: a mistake is corrected by recording
 * another movement, never by editing one out of existence, because the point of
 * a ledger is that it explains how the balance got to where it is.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

const REASON_LABELS = {
  receipt: 'Stock arrived',
  sale: 'Sold',
  return: 'Customer return',
  damage: 'Damaged / expired',
  theft: 'Known loss',
  count: 'Stocktake correction',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
};

document.addEventListener('admin:ready', load);

async function load() {
  const sku = new URLSearchParams(location.search).get('sku');
  const body = document.querySelector('[data-mv-body]');
  if (!body) return;

  // This page is one product's ledger and needs a ?sku= to have anything to
  // show. Reached without one — a bookmark, a shared link, a back button
  // that dropped the query — it used to return here silently and leave
  // "Loading movements…" on screen forever: a page that looks like it is
  // still working, permanently. Say what happened and offer the way on.
  if (!sku) {
    body.innerHTML = `<tr><td colspan="6" class="atable__empty">
      Pick a product on the <a href="/admin/stock">Stock</a> screen
      to see how its balance got to where it is.</td></tr>`;
    return;
  }

  let data;
  try {
    ({ data } = await adminFetch(`/stock/${encodeURIComponent(sku)}/movements`));
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — movements appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    return;
  }

  document.querySelector('[data-mv-title]').textContent = data.title;
  // "Not recorded yet" rather than a blank or a zero. A missing cost is a
  // fact about the data, and the whole margin story depends on noticing it.
  document.querySelector('[data-mv-meta]').textContent = data.averageCostTaka === null
    ? `${data.sku} · average cost not recorded yet — enter unit costs on receipts`
    : `${data.sku} · average cost ৳ ${data.averageCostTaka}`;
  document.title = `${data.title} — GulfRabit Admin`;

  if (!data.movements.length) {
    body.innerHTML = '<tr><td colspan="6" class="atable__empty">No movements recorded.</td></tr>';
    return;
  }

  body.innerHTML = data.movements.map((m) => `
    <tr>
      <td class="atable__sub">${when(m.at)}</td>
      <td class="atable__num"><strong>${m.qty > 0 ? '+' : ''}${m.qty}</strong></td>
      <td>${escapeHtml(REASON_LABELS[m.reason] || m.reason)}</td>
      <td class="atable__num">${m.unitCostTaka == null ? '—' : `৳ ${m.unitCostTaka}`}</td>
      <td class="atable__sub">${escapeHtml(m.actor || '—')}</td>
      <td class="atable__sub">${escapeHtml(m.note || '')}</td>
    </tr>`).join('');
}

function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
