/**
 * products-page.js — the catalogue list.
 *
 * Leads with the missing-cost count. Without cost there is no margin and no
 * profit figure, and the fastest way to turn that from a vague blocker into
 * work somebody can finish is to put a number on it at the top of the screen.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';

let page = 1;

document.addEventListener('admin:ready', init);

function init() {
  const form = document.querySelector('[data-prod-filters]');
  if (!form) return;

  const params = new URLSearchParams(location.search);
  ['q', 'noCost'].forEach((k) => { if (params.has(k) && form[k]) form[k].value = params.get(k); });
  page = Math.max(1, Number(params.get('page')) || 1);

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  document.querySelector('[data-prod-clear]')?.addEventListener('click', () => { form.reset(); page = 1; load(); });
  document.querySelector('[data-cost-gap-filter]')?.addEventListener('click', () => {
    form.noCost.value = '1';
    page = 1;
    load();
  });
  document.querySelector('[data-ppage-prev]')?.addEventListener('click', () => { page--; load(); });
  document.querySelector('[data-ppage-next]')?.addEventListener('click', () => { page++; load(); });

  load();
}

async function load() {
  const body = document.querySelector('[data-prod-body]');
  const form = document.querySelector('[data-prod-filters]');

  const qs = new URLSearchParams();
  ['q', 'noCost'].forEach((k) => {
    const v = form[k]?.value.trim();
    if (v) qs.set(k, v);
  });
  if (page > 1) qs.set('page', String(page));
  history.replaceState(null, '', qs.toString() ? `?${qs}` : location.pathname);

  body.innerHTML = '<tr><td colspan="6" class="atable__empty">Loading…</td></tr>';

  let payload;
  try {
    payload = await adminFetch(`/products?${qs}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — products appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    document.querySelector('[data-prod-count]').textContent = '';
    return;
  }

  paint(payload);
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-prod-body]');
  document.querySelector('[data-prod-count]').textContent =
    `${meta.total.toLocaleString('en-BD')} product${meta.total === 1 ? '' : 's'}`;

  const gap = document.querySelector('[data-cost-gap]');
  if (meta.missingCost > 0) {
    gap.hidden = false;
    document.querySelector('[data-cost-gap-n]').textContent = meta.missingCost;
  } else {
    gap.hidden = true;
  }

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="6" class="atable__empty">Nothing matches these filters.</td></tr>';
    document.querySelector('[data-prod-pager]').hidden = true;
    return;
  }

  body.innerHTML = data.map((p) => `
    <tr>
      <td>
        <a href="/modules/admin/product-edit.html?sku=${encodeURIComponent(p.sku)}">${escapeHtml(p.title)}</a>
        <div class="atable__sub">${escapeHtml(p.sku)}${p.brand ? ` · ${escapeHtml(p.brand)}` : ''}</div>
      </td>
      <td class="atable__sub">${escapeHtml(p.category || '—')}</td>
      <td class="atable__num">৳ ${Number(p.priceTaka).toLocaleString('en-BD')}</td>
      <td class="atable__num">${
        // "Not recorded" rather than a dash or a zero. The distinction is the
        // whole reason the column is nullable.
        p.costTaka == null
          ? '<span class="atable__sub">not recorded</span>'
          : `৳ ${Number(p.costTaka).toLocaleString('en-BD')}`
      }</td>
      <td class="atable__num">${p.marginPct == null ? '<span class="atable__sub">—</span>' : `${p.marginPct}%`}</td>
      <td>${status(p)}</td>
    </tr>`).join('');

  const pager = document.querySelector('[data-prod-pager]');
  pager.hidden = meta.lastPage <= 1;
  document.querySelector('[data-ppage-label]').textContent = `Page ${meta.currentPage} of ${meta.lastPage}`;
  document.querySelector('[data-ppage-prev]').disabled = meta.currentPage <= 1;
  document.querySelector('[data-ppage-next]').disabled = meta.currentPage >= meta.lastPage;
}

function status(p) {
  if (!p.isActive) return '<span class="apill apill--wait">Unlisted</span>';
  return p.inStock
    ? '<span class="apill apill--ok">In stock</span>'
    : '<span class="apill apill--bad">Out of stock</span>';
}
