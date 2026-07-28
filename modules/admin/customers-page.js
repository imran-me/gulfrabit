/**
 * customers-page.js — the customer index.
 *
 * Search-first rather than browse-first. The list still paginates, because
 * support work sometimes means "who ordered yesterday", but the screen leads
 * with a search box and says why: this is an index of real people's phone
 * numbers, and a tool that invites idle browsing gets idly browsed.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';

let page = 1;

document.addEventListener('admin:ready', init);

function init() {
  const form = document.querySelector('[data-cust-filters]');
  if (!form) return;

  const params = new URLSearchParams(location.search);
  if (params.has('q')) form.q.value = params.get('q');
  page = Math.max(1, Number(params.get('page')) || 1);

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  document.querySelector('[data-cust-clear]')?.addEventListener('click', () => { form.reset(); page = 1; load(); });
  document.querySelector('[data-cpage-prev]')?.addEventListener('click', () => { page--; load(); });
  document.querySelector('[data-cpage-next]')?.addEventListener('click', () => { page++; load(); });

  load();
}

async function load() {
  const body = document.querySelector('[data-cust-body]');
  const q = document.querySelector('[data-cust-filters]').q.value.trim();

  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (page > 1) qs.set('page', String(page));
  history.replaceState(null, '', qs.toString() ? `?${qs}` : location.pathname);

  body.innerHTML = '<tr><td colspan="6" class="atable__empty">Loading…</td></tr>';

  let payload;
  try {
    payload = await adminFetch(`/customers?${qs}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="atable__empty">${message(err)}</td></tr>`;
    document.querySelector('[data-cust-count]').textContent = '';
    return;
  }

  paint(payload);
}

function message(err) {
  // 403 is said plainly. A blank table would look broken, and the person needs
  // to know it is their role rather than the system.
  if (err.status === 403) return 'Your role cannot open customer records.';
  if (err.status === 404 || !err.status) {
    return 'No backend connected yet — customers appear once the API is live.';
  }
  return escapeHtml(err.message);
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-cust-body]');
  document.querySelector('[data-cust-count]').textContent =
    `${meta.total.toLocaleString('en-BD')} customer${meta.total === 1 ? '' : 's'}`;

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="6" class="atable__empty">No customer matches that search.</td></tr>';
    document.querySelector('[data-cust-pager]').hidden = true;
    return;
  }

  body.innerHTML = data.map((c) => `
    <tr>
      <td>
        <a href="/modules/admin/customer.html?id=${c.id}">${escapeHtml(c.name)}</a>
        <div class="atable__sub">${escapeHtml(c.email || 'no email')}${c.verified ? '' : ' · unverified'}</div>
      </td>
      <td>${escapeHtml(c.phone)}</td>
      <td class="atable__num">${c.orders}</td>
      <td class="atable__num">৳ ${Number(c.spentTaka).toLocaleString('en-BD')}</td>
      <td class="atable__sub">${when(c.lastOrderAt)}</td>
      <td class="atable__sub">${when(c.joinedAt)}</td>
    </tr>`).join('');

  const pager = document.querySelector('[data-cust-pager]');
  pager.hidden = meta.lastPage <= 1;
  document.querySelector('[data-cpage-label]').textContent = `Page ${meta.currentPage} of ${meta.lastPage}`;
  document.querySelector('[data-cpage-prev]').disabled = meta.currentPage <= 1;
  document.querySelector('[data-cpage-next]').disabled = meta.currentPage >= meta.lastPage;
}

function when(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
