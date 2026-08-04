/**
 * campaigns-page.js — orders and revenue by the ad that recruited them.
 *
 * Read-only: this screen changes nothing, it only groups what the orders
 * screen already shows. The one piece of state is the period select, kept in
 * the URL so a bookmarked "last 90 days" reopens as last 90 days.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

document.addEventListener('admin:ready', init);

function init() {
  const select = document.querySelector('[data-cg-days]');
  if (!select) return;

  const fromUrl = new URLSearchParams(location.search).get('days');
  if (fromUrl && select.querySelector(`option[value="${fromUrl}"]`)) select.value = fromUrl;

  select.addEventListener('change', load);
  load();
}

async function load() {
  const days = document.querySelector('[data-cg-days]').value;
  const body = document.querySelector('[data-cg-body]');

  history.replaceState(null, '', days === '30' ? location.pathname : `?days=${days}`);
  body.innerHTML = '<tr><td colspan="6" class="atable__empty">Loading…</td></tr>';

  let payload;
  try {
    payload = await adminFetch(`/marketing/campaigns?days=${encodeURIComponent(days)}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — campaigns appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    document.querySelector('[data-cg-cards]').hidden = true;
    return;
  }

  paint(payload);
}

function paint({ data, meta }) {
  const cards = document.querySelector('[data-cg-cards]');
  const body = document.querySelector('[data-cg-body]');

  cards.hidden = false;
  setText('[data-cg-ad-revenue]', taka(meta.adRevenueTaka));
  // Share of revenue, not of orders: five tiny ad orders out of six total
  // reads as "83% of orders" and would flatter a campaign that sold pennies.
  setText('[data-cg-ad-share]', meta.revenueTaka > 0
    ? `${Math.round((meta.adRevenueTaka / meta.revenueTaka) * 100)}%`
    : '—');
  setText('[data-cg-ad-orders]', String(meta.adOrders));
  setText('[data-cg-sub]', `${meta.totalOrders} order${meta.totalOrders === 1 ? '' : 's'} in the last ${meta.days} days.`);

  if (!data.length) {
    body.innerHTML = `<tr><td colspan="6" class="atable__empty">
      No orders in this period yet. Rows appear as orders arrive — each one
      remembers which ad sold it, or that none did.</td></tr>`;
    return;
  }

  body.innerHTML = data.map((r) => `
    <tr>
      <td>
        ${r.campaign === '(organic)'
          ? '<span class="atable__sub">Organic — no ad involved</span>'
          : `<strong>${escapeHtml(r.campaign)}</strong>`}
      </td>
      <td class="atable__sub">${escapeHtml([r.source, r.medium].filter(Boolean).join(' · ') || '—')}</td>
      <td class="atable__num">${r.orders}</td>
      <td class="atable__num">${
        // A cancel rate worth worrying about should look worrying: a third or
        // more of a campaign's orders cancelling is the junk-traffic signature.
        r.cancelled > 0 && r.cancelled >= r.orders / 3
          ? `<span class="apill apill--bad">${r.cancelled}</span>`
          : (r.cancelled || '—')
      }</td>
      <td class="atable__num">${taka(r.revenueTaka)}</td>
      <td class="atable__sub">${when(r.lastOrderAt)}</td>
    </tr>`).join('');
}

function taka(n) { return `৳ ${Number(n || 0).toLocaleString('en-BD')}`; }

function when(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function setText(sel, v) { const el = document.querySelector(sel); if (el) el.textContent = v; }
