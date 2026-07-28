/**
 * customer-detail-page.js — one customer: profile, orders, addresses, notes,
 * and the erasure control.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';

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
  paintForget();
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
      <td><a href="/modules/admin/order.html?no=${encodeURIComponent(o.orderNumber)}">${escapeHtml(o.orderNumber)}</a></td>
      <td><span class="apill apill--${tone(o.status)}">${escapeHtml(o.status)}</span></td>
      <td class="atable__num">৳ ${Number(o.totalTaka).toLocaleString('en-BD')}</td>
      <td class="atable__sub">${when(o.placedAt)}</td>
    </tr>`).join('');
}

function tone(status) {
  if (status === 'delivered') return 'ok';
  if (status === 'cancelled' || status === 'returned') return 'bad';
  return 'wait';
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
