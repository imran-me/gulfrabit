/**
 * orders-page.js — the order list.
 *
 * Filter state lives in the URL, not in a variable. A colleague asking "which
 * orders are stuck in packed?" should be answerable by sending them a link, and
 * a reloaded page should not silently drop back to showing everything.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';

const FILTER_KEYS = ['q', 'status', 'paymentStatus', 'from', 'to'];
let page = 1;

document.addEventListener('admin:ready', init);

function init() {
  const form = document.querySelector('[data-orders-filters]');
  if (!form) return;

  // Restore from the URL so a shared or bookmarked link opens the same view.
  const params = new URLSearchParams(location.search);
  FILTER_KEYS.forEach((k) => { if (params.has(k) && form[k]) form[k].value = params.get(k); });
  page = Math.max(1, Number(params.get('page')) || 1);

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  document.querySelector('[data-orders-clear]')?.addEventListener('click', () => {
    form.reset(); page = 1; load();
  });
  document.querySelector('[data-page-prev]')?.addEventListener('click', () => { page--; load(); });
  document.querySelector('[data-page-next]')?.addEventListener('click', () => { page++; load(); });

  load();
}

function currentFilters() {
  const form = document.querySelector('[data-orders-filters]');
  const out = {};
  FILTER_KEYS.forEach((k) => {
    const v = form[k]?.value.trim();
    if (v) out[k] = v;
  });
  return out;
}

async function load() {
  const body = document.querySelector('[data-orders-body]');
  const filters = currentFilters();

  // Mirror to the URL before fetching, so the address bar is right even if the
  // request is slow or fails.
  const qs = new URLSearchParams(filters);
  if (page > 1) qs.set('page', String(page));
  history.replaceState(null, '', qs.toString() ? `?${qs}` : location.pathname);

  body.innerHTML = `<tr><td colspan="8" class="atable__empty">Loading…</td></tr>`;

  let payload;
  try {
    payload = await adminFetch(`/orders?${new URLSearchParams({ ...filters, page: String(page) })}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="8" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — orders appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    document.querySelector('[data-orders-count]').textContent = '';
    document.querySelector('[data-orders-pager]').hidden = true;
    return;
  }

  paint(payload);
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-orders-body]');
  const count = document.querySelector('[data-orders-count]');

  count.textContent = meta.total === 0
    ? 'No orders match these filters.'
    : `${meta.total.toLocaleString('en-BD')} order${meta.total === 1 ? '' : 's'}`;

  if (!data.length) {
    body.innerHTML = `<tr><td colspan="8" class="atable__empty">Nothing here. Try widening the filters.</td></tr>`;
    document.querySelector('[data-orders-pager]').hidden = true;
    return;
  }

  body.innerHTML = data.map((o) => `
    <tr>
      <td><a href="/modules/admin/order.html?no=${encodeURIComponent(o.orderNumber)}">${escapeHtml(o.orderNumber)}</a></td>
      <td>
        <div>${escapeHtml(o.customerName)}</div>
        <div class="atable__sub">${escapeHtml(o.customerPhone)}</div>
      </td>
      <td>${escapeHtml(o.district || '—')}</td>
      <td class="atable__num">${o.itemCount}</td>
      <td class="atable__num">৳ ${Number(o.totalTaka).toLocaleString('en-BD')}</td>
      <td>${pill(o.paymentStatus, paymentTone(o.paymentStatus))}</td>
      <td>${pill(o.status, statusTone(o.status))}</td>
      <td class="atable__sub">${formatWhen(o.placedAt)}</td>
    </tr>`).join('');

  const pager = document.querySelector('[data-orders-pager]');
  pager.hidden = meta.lastPage <= 1;
  document.querySelector('[data-page-label]').textContent = `Page ${meta.currentPage} of ${meta.lastPage}`;
  document.querySelector('[data-page-prev]').disabled = meta.currentPage <= 1;
  document.querySelector('[data-page-next]').disabled = meta.currentPage >= meta.lastPage;
}

/* Tone carries meaning that colour alone would not: the label is always the
   word, so this is reinforcement rather than the only signal. */
function statusTone(s) {
  if (s === 'delivered') return 'ok';
  if (s === 'cancelled' || s === 'returned') return 'bad';
  if (s === 'shipped') return 'info';
  return 'wait';
}
function paymentTone(s) {
  if (s === 'paid') return 'ok';
  if (s === 'failed') return 'bad';
  if (s === 'refunded') return 'info';
  return 'wait';
}
function pill(text, tone) {
  return `<span class="apill apill--${tone}">${escapeHtml(text)}</span>`;
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
