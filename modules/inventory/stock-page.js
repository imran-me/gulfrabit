/**
 * stock-page.js — stock levels and the movement form.
 *
 * There is no control here that sets a quantity. Every change is a movement
 * with a reason, because a ledger that can be overwritten stops being able to
 * explain its own balance — and "shrinkage" is a number you can only produce if
 * damage and theft were never recorded as generic corrections.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

let page = 1;
let warehouses = [];

document.addEventListener('admin:ready', init);

async function init() {
  const form = document.querySelector('[data-stock-filters]');
  if (!form) return;

  const params = new URLSearchParams(location.search);
  ['q', 'warehouse', 'lowOnly'].forEach((k) => {
    if (params.has(k) && form[k]) form[k].value = params.get(k);
  });
  page = Math.max(1, Number(params.get('page')) || 1);

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  document.querySelector('[data-stock-clear]')?.addEventListener('click', () => { form.reset(); page = 1; load(); });
  document.querySelector('[data-move-form]')?.addEventListener('submit', submitMovement);

  await loadWarehouses();
  load();
}

async function loadWarehouses() {
  try {
    ({ data: warehouses } = await adminFetch('/warehouses'));
  } catch {
    // The stock list still works without the warehouse filter, so a failure
    // here must not stop the page loading.
    warehouses = [];
  }

  const options = warehouses.map(
    (w) => `<option value="${escapeHtml(w.key)}">${escapeHtml(w.name)}</option>`,
  ).join('');

  const filter = document.querySelector('[data-stock-filters] [name="warehouse"]');
  if (filter) filter.insertAdjacentHTML('beforeend', options);

  const moveSelect = document.querySelector('[data-move-form] [name="warehouse"]');
  if (moveSelect) moveSelect.innerHTML = options || '<option value="">No warehouse configured</option>';
}

async function load() {
  const body = document.querySelector('[data-stock-body]');
  const form = document.querySelector('[data-stock-filters]');

  const qs = new URLSearchParams();
  ['q', 'warehouse', 'lowOnly'].forEach((k) => {
    const v = form[k]?.value.trim();
    if (v) qs.set(k, v);
  });
  if (page > 1) qs.set('page', String(page));
  history.replaceState(null, '', qs.toString() ? `?${qs}` : location.pathname);

  body.innerHTML = '<tr><td colspan="6" class="atable__empty">Loading…</td></tr>';

  let payload;
  try {
    payload = await adminFetch(`/stock?${qs}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — stock appears once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    document.querySelector('[data-stock-count]').textContent = '';
    return;
  }

  paint(payload);
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-stock-body]');
  document.querySelector('[data-stock-count]').textContent =
    `${meta.total.toLocaleString('en-BD')} stock line${meta.total === 1 ? '' : 's'}`;

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="6" class="atable__empty">Nothing matches these filters.</td></tr>';
    return;
  }

  body.innerHTML = data.map((l) => `
    <tr>
      <td>
        <a href="/admin/stock/movements?sku=${encodeURIComponent(l.sku)}">${escapeHtml(l.title)}</a>
        <div class="atable__sub">${escapeHtml(l.sku)}</div>
      </td>
      <td>${escapeHtml(l.warehouse || '—')}</td>
      <td class="atable__num">${l.onHand}</td>
      <td class="atable__num">${l.reserved || '—'}</td>
      <td class="atable__num">${
        // "Low" is decided by the server so every screen agrees what it means.
        l.isLow ? `<span class="apill apill--bad">${l.available}</span>` : l.available
      }</td>
      <td class="atable__num atable__sub">${l.reorderLevel}</td>
    </tr>`).join('');
}

async function submitMovement(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  // Outward reasons are entered as a positive number and sent negative. Asking
  // a warehouse hand to type "-3" for breakage is a sign error waiting to
  // happen, and the sign is what the reason already tells us.
  const outward = ['damage', 'theft', 'transfer_out'].includes(form.reason.value);
  const magnitude = Math.abs(Number(form.qty.value));

  try {
    await adminFetch('/stock/movements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: form.sku.value.trim(),
        warehouse: form.warehouse.value,
        reason: form.reason.value,
        qty: outward ? -magnitude : magnitude,
        unitCostTaka: form.unitCostTaka.value ? Number(form.unitCostTaka.value) : null,
      }),
    });
  } catch (err) {
    btn.disabled = false;
    const el = document.querySelector('[data-stock-error]');
    el.textContent = err.message;
    el.hidden = false;
    return;
  }

  location.reload();
}
