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
import { canDelete, confirmDelete, toast } from './admin-delete.js';

let page = 1;

document.addEventListener('admin:ready', init);

function init() {
  const form = document.querySelector('[data-cust-filters]');
  if (!form) return;

  paintTabs({});   // drawn immediately, the count filled in when it arrives

  const params = new URLSearchParams(location.search);
  if (params.has('q')) form.q.value = params.get('q');
  if (params.has('deleted')) form.deleted.value = '1';
  page = Math.max(1, Number(params.get('page')) || 1);

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  document.querySelector('[data-cust-clear]')?.addEventListener('click', () => {
    form.reset();
    // reset() restores a hidden input's DEFAULT attribute rather than clearing
    // it, and that default is empty here — so Clear genuinely leaves the
    // Deleted tab as well as emptying the search box.
    form.deleted.value = '';
    page = 1;
    load();
  });

  // Delegated to the bar and the tbody, both of which are repainted on every
  // load — handlers bound to elements that get replaced are handlers that
  // quietly stop working.
  document.querySelector('[data-cust-tabs]')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-cust-tab]');
    if (!tab) return;
    form.deleted.value = tab.dataset.custTab;
    page = 1;
    load();
  });

  document.querySelector('[data-cust-body]')?.addEventListener('click', (e) => {
    const del = e.target.closest('[data-adel-id]');
    if (del) return remove(del);
    const back = e.target.closest('[data-arestore-id]');
    if (back) return putBack(back);
  });
  document.querySelector('[data-cpage-prev]')?.addEventListener('click', () => { page--; load(); });
  document.querySelector('[data-cpage-next]')?.addEventListener('click', () => { page++; load(); });

  load();
}

async function load() {
  const body = document.querySelector('[data-cust-body]');
  const form = document.querySelector('[data-cust-filters]');
  const q = form.q.value.trim();

  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (form.deleted.value) qs.set('deleted', '1');
  if (page > 1) qs.set('page', String(page));
  history.replaceState(null, '', qs.toString() ? `?${qs}` : location.pathname);

  body.innerHTML = '<tr><td colspan="6" class="atable__empty">Loading…</td></tr>';

  let payload;
  try {
    payload = await adminFetch(`/customers?${qs}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" class="atable__empty">${message(err)}</td></tr>`;
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

/**
 * Two places, not two screens: the live list and what has been taken off it.
 *
 * A tab bar rather than a checkbox in the filters, because "deleted" is a
 * place you go and stand — the rows there behave differently and offer
 * different things — not a property you filter the same list by.
 */
function paintTabs(meta) {
  const host = document.querySelector('[data-cust-tabs]');
  if (!host) return;

  const inTrash = !!document.querySelector('[data-cust-filters]')?.deleted.value;
  const badge = (n) => (n === undefined ? '' : `<span class="atab__count">${n.toLocaleString('en-BD')}</span>`);

  host.innerHTML = `
    <button class="atab${inTrash ? '' : ' is-on'}" type="button" data-cust-tab=""
            aria-current="${inTrash ? 'false' : 'page'}">
      Customers${badge(meta.liveCount)}
    </button>
    <button class="atab atab--trash${inTrash ? ' is-on' : ''}" type="button" data-cust-tab="1"
            aria-current="${inTrash ? 'page' : 'false'}">
      Deleted${badge(meta.deletedCount)}
    </button>`;
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-cust-body]');
  const inTrash = !!document.querySelector('[data-cust-filters]').deleted.value;

  paintTabs(meta);

  document.querySelector('[data-cust-count]').textContent = inTrash
    ? `${meta.total.toLocaleString('en-BD')} deleted customer${meta.total === 1 ? '' : 's'}`
    : `${meta.total.toLocaleString('en-BD')} customer${meta.total === 1 ? '' : 's'}`;

  if (!data.length) {
    body.innerHTML = `<tr><td colspan="7" class="atable__empty">${
      inTrash
        ? 'Nobody has been deleted. Customers you delete land here, and can be put back.'
        : 'No customer matches that search.'
    }</td></tr>`;
    document.querySelector('[data-cust-pager]').hidden = true;
    return;
  }

  body.innerHTML = data.map((c) => `
    <tr class="${c.deletedAt ? 'is-deleted' : ''}">
      <td class="atable__name">
        <a href="/admin/customer?id=${c.id}">${escapeHtml(c.name)}</a>
        <div class="atable__sub">${escapeHtml(c.email || 'no email')}${c.verified ? '' : ' · unverified'}</div>
      </td>
      <td>${escapeHtml(c.phone)}</td>
      <td class="atable__num">${c.orders}</td>
      <td class="atable__num">৳ ${Number(c.spentTaka).toLocaleString('en-BD')}</td>
      <td class="atable__sub">${when(c.lastOrderAt)}</td>
      <td class="atable__sub">${when(c.joinedAt)}</td>
      <td>${rowAction(c)}</td>
    </tr>`).join('');

  const pager = document.querySelector('[data-cust-pager]');
  pager.hidden = meta.lastPage <= 1;
  document.querySelector('[data-cpage-label]').textContent = `Page ${meta.currentPage} of ${meta.lastPage}`;
  document.querySelector('[data-cpage-prev]').disabled = meta.currentPage <= 1;
  document.querySelector('[data-cpage-next]').disabled = meta.currentPage >= meta.lastPage;
}

/* ---- Deleting ----------------------------------------------------------
   The list's delete is the reversible one: off the list, everything kept.
   Erasing a customer is a different, irreversible act and it stays where it
   was, on the customer's own screen, behind a typed reason. */

function rowAction(c) {
  if (!canDelete()) return '';
  return c.deletedAt
    ? `<button type="button" class="alink-btn" data-arestore-id="${c.id}"
               data-name="${escapeHtml(c.name)}"
               aria-label="Restore ${escapeHtml(c.name)}">Restore</button>`
    : `<button type="button" class="alink-btn alink-btn--danger" data-adel-id="${c.id}"
               data-name="${escapeHtml(c.name)}" data-orders="${c.orders}"
               aria-label="Delete ${escapeHtml(c.name)}">Delete</button>`;
}

async function remove(btn) {
  const { adelId: id, name, orders } = btn.dataset;
  const n = Number(orders);

  const ok = await confirmDelete({
    title: `Delete ${name}?`,
    // The order count is the fact that changes the answer. Removing somebody
    // with fourteen orders behind them is a different decision from removing a
    // test account, and the person clicking should see which one this is.
    body: n > 0
      ? `They have ${n} order${n === 1 ? '' : 's'}. Those orders stay exactly as they are, `
        + 'with their own delivery details — deleting the customer does not unsell anything.'
      : 'They leave the customer list and every count. Nothing is erased.',
    confirm: 'Delete customer',
  });
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = 'Deleting…';

  try {
    const { message: msg } = await adminFetch(`/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast(msg || `${name} deleted.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Delete';
    return toast(err.message, false);
  }

  load();
}

async function putBack(btn) {
  const { arestoreId: id, name } = btn.dataset;
  btn.disabled = true;
  btn.textContent = 'Restoring…';

  try {
    const { message: msg } = await adminFetch(`/customers/${encodeURIComponent(id)}/restore`, { method: 'POST' });
    toast(msg || `${name} restored.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Restore';
    return toast(err.message, false);
  }

  load();
}

function when(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
