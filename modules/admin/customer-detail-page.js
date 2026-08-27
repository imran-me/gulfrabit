/**
 * customer-detail-page.js — one customer: profile, orders, addresses, notes,
 * and the two ways to remove them.
 *
 * TWO REMOVALS, KEPT APART ON PURPOSE
 * -----------------------------------
 * Delete, at the top, is the ordinary one: they leave the customer list and
 * every count, their orders are untouched, and an owner can put them back.
 * Erase, in the card at the bottom, overwrites their name, phone, email and
 * addresses here AND on past orders, and cannot be undone.
 *
 * They are at opposite ends of the screen, worded differently, and only one of
 * them demands a typed reason — because the day somebody reaches for the wrong
 * one is the day this screen has failed.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { canDelete, confirmDelete, toast } from './admin-delete.js';
import { stageLabel, stageTone } from './order-stages.js';

let customer = null;
let session = null;

document.addEventListener('admin:ready', ({ detail }) => {
  session = detail.session;
  load();
});

const id = () => new URLSearchParams(location.search).get('id');

async function load() {
  if (!id()) return fail('No customer id in the URL.');

  try {
    ({ data: customer } = await adminFetch(`/customers/${encodeURIComponent(id())}`));
  } catch (err) {
    if (err.status === 403) return fail('Your role cannot open customer records.');
    if (err.status === 404 || !err.status) {
      return fail('No backend connected yet — this screen fills in once the API is live.');
    }
    return fail(err.message);
  }

  paintProfile();
  paintOrders();
  paintAddresses();
  paintNotes();
  paintActions();
  paintForget();
}

/**
 * Delete, or restore, at the top of the screen.
 *
 * Deliberately nowhere near the erasure card at the foot of the page. They are
 * different acts with different consequences, and putting them side by side
 * would be an invitation to reach for the wrong one.
 */
function paintActions() {
  const host = document.querySelector('[data-cust-actions]');
  const banner = document.querySelector('[data-cust-deleted]');
  if (!host) return;

  if (banner) {
    banner.hidden = !customer.deletedAt;
    banner.textContent = customer.deletedAt
      ? `${customer.name} was deleted on ${when(customer.deletedAt)}. They do not appear in the `
        + 'customer list or any count. Nothing has been erased, and their orders are unchanged.'
      : '';
  }

  if (!canDelete('customers', session)) { host.innerHTML = ''; return; }

  host.innerHTML = customer.deletedAt
    ? '<button class="btn-gr btn-primary-gr btn-sm-gr" type="button" data-cust-restore>Restore customer</button>'
    : '<button class="btn-gr btn-danger-gr btn-sm-gr" type="button" data-cust-delete>Delete customer</button>';

  host.querySelector('[data-cust-delete]')?.addEventListener('click', (e) => remove(e.currentTarget));
  host.querySelector('[data-cust-restore]')?.addEventListener('click', (e) => putBack(e.currentTarget));
}

async function remove(btn) {
  const n = customer.stats?.orders ?? 0;

  const ok = await confirmDelete({
    title: `Delete ${customer.name}?`,
    // Named apart from erasure in the dialog too, not only on the page. This
    // is the last moment before the act, and it is the moment somebody who
    // reached for the wrong control can still notice.
    body: (n > 0
      ? `They have ${n} order${n === 1 ? '' : 's'}, and those stay exactly as they are. `
      : '')
      + 'Their name, phone and email are kept — this is not the erasure below.',
    confirm: 'Delete customer',
  });
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = 'Deleting…';

  try {
    const { message } = await adminFetch(`/customers/${encodeURIComponent(id())}`, { method: 'DELETE' });
    toast(message || `${customer.name} deleted.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Delete customer';
    return toast(err.message, false);
  }

  location.reload();
}

async function putBack(btn) {
  btn.disabled = true;
  btn.textContent = 'Restoring…';

  try {
    const { message } = await adminFetch(
      `/customers/${encodeURIComponent(id())}/restore`, { method: 'POST' });
    toast(message || `${customer.name} restored.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Restore customer';
    return toast(err.message, false);
  }

  location.reload();
}

function paintProfile() {
  document.querySelector('[data-cust-name]').textContent = customer.name;
  document.querySelector('[data-cust-meta]').textContent =
    `${customer.phone}${customer.verified ? ' (verified)' : ' (unverified)'} · joined ${when(customer.joinedAt)}`;
  document.title = `${customer.name} — GulfRabit Admin`;

  document.querySelector('[data-cust-profile]').innerHTML = [
    ['Phone', customer.phone],
    ['Email', customer.email || '—'],
    ['Tier', customer.tier],
  ].map(([k, v]) => `<div class="akv__row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join('');

  const s = customer.stats;
  document.querySelector('[data-cust-stats]').innerHTML = [
    [s.orders, 'paid orders'],
    [`৳ ${Number(s.spentTaka).toLocaleString('en-BD')}`, 'lifetime spend'],
    [`৳ ${Number(s.avgOrderTaka).toLocaleString('en-BD')}`, 'average order'],
  ].map(([n, l]) => `<div class="acard"><span class="acard__n">${n}</span><span class="acard__l">${l}</span></div>`).join('');
}

function paintOrders() {
  const host = document.querySelector('[data-cust-orders]');
  if (!customer.orders.length) {
    host.innerHTML = '<tr><td colspan="4" class="atable__empty">No orders yet.</td></tr>';
    return;
  }
  host.innerHTML = customer.orders.map((o) => `
    <tr>
      <td><a href="/admin/order?no=${encodeURIComponent(o.orderNumber)}">${escapeHtml(o.orderNumber)}</a></td>
      <td><span class="apill apill--label apill--${stageTone(o.status)}">${escapeHtml(stageLabel(o.status))}</span></td>
      <td class="atable__num">৳ ${Number(o.totalTaka).toLocaleString('en-BD')}</td>
      <td class="atable__sub">${when(o.placedAt)}</td>
    </tr>`).join('');
}

function paintAddresses() {
  const host = document.querySelector('[data-cust-addresses]');
  host.innerHTML = customer.addresses.length
    ? `<ul class="arefunds" role="list">${customer.addresses.map((a) => `
        <li class="arefund">
          <div><strong>${escapeHtml(a.label || 'Address')}</strong>${a.isDefault ? ' · default' : ''}</div>
          <div class="atable__sub">${escapeHtml(a.line || '')}${a.district ? `, ${escapeHtml(a.district)}` : ''}</div>
        </li>`).join('')}</ul>`
    : '<p class="admin__sub" style="margin:0">No saved addresses.</p>';
}

function paintNotes() {
  renderNotes();

  document.querySelector('[data-note-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = form.querySelector('button');
    btn.disabled = true;

    try {
      const { data } = await adminFetch(`/customers/${encodeURIComponent(id())}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: form.body.value.trim() }),
      });
      customer.notes.unshift(data);
      form.reset();
      renderNotes();
    } catch (err) {
      fail(err.message);
    }

    btn.disabled = false;
  });
}

function renderNotes() {
  document.querySelector('[data-cust-notes]').innerHTML = customer.notes.length
    ? customer.notes.map((n) => `
        <li class="arefund">
          <div>${escapeHtml(n.body)}</div>
          <div class="atable__sub">${escapeHtml(n.author)} · ${when(n.at)}</div>
        </li>`).join('')
    : '<li class="atable__sub">No notes yet.</li>';
}

function paintForget() {
  // Owners only — and hidden rather than disabled, because a control that
  // refuses the person looking at it is only a source of confusion.
  if (session?.role !== 'owner') return;

  const section = document.querySelector('[data-forget-section]');
  section.hidden = false;

  section.querySelector('[data-forget-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;

    // This rewrites historical records and cannot be undone, so a reflexive
    // click is not enough on its own.
    const ok = confirm(
      `Erase the personal details of ${customer.name}? Order figures are kept. This cannot be undone.`,
    );
    if (!ok) return;

    const btn = form.querySelector('button');
    btn.disabled = true;

    try {
      await adminFetch(`/customers/${encodeURIComponent(id())}/forget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: form.reason.value.trim() }),
      });
    } catch (err) {
      btn.disabled = false;
      return fail(err.message);
    }

    location.reload();
  });
}

function fail(message) {
  const el = document.querySelector('[data-cust-error]');
  el.textContent = message;
  el.hidden = false;
}

function when(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
