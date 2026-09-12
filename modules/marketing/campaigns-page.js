/**
 * campaigns-page.js — what each ad cost, what it sold, and what was delivered.
 *
 * The report itself is read-only and groups what the orders screen already
 * shows. The section underneath it is not: it holds where the spend is read
 * from, the days typed by hand, and the campaigns whose Meta name does not
 * match the utm tag on their links.
 *
 * Nothing numeric is computed here. Cost per order, cost per delivered order
 * and both returns on spend arrive from the server, so this screen and
 * anything else that reports them can never disagree.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

const $ = (sel) => document.querySelector(sel);

document.addEventListener('admin:ready', init);

function init() {
  const select = $('[data-cg-days]');
  if (!select) return;

  const fromUrl = new URLSearchParams(location.search).get('days');
  if (fromUrl && select.querySelector(`option[value="${fromUrl}"]`)) select.value = fromUrl;

  select.addEventListener('change', load);
  $('[data-cg-sync]')?.addEventListener('click', sync);
  $('[data-cg-save]')?.addEventListener('click', saveSettings);
  $('[data-cg-m-add]')?.addEventListener('click', addManual);

  // Delegated: both lists are repainted on every period change and after
  // every save, and per-row handlers would leak with each repaint.
  $('[data-cg-rows]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cg-m-del]');
    if (btn) removeManual(btn.dataset.cgMDel);
  });
  $('[data-cg-map]')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-cg-map-save]')) saveMap();
  });

  // Today, as the default date for a typed row: the overwhelmingly common
  // case is somebody entering what they just spent.
  const date = $('[data-cg-m-date]');
  if (date) date.value = new Date().toISOString().slice(0, 10);

  load();
}

function days() {
  return $('[data-cg-days]').value;
}

/* ---- the report -------------------------------------------------------- */

async function load() {
  const d = days();
  const body = $('[data-cg-body]');

  history.replaceState(null, '', d === '30' ? location.pathname : `?days=${d}`);
  body.innerHTML = '<tr><td colspan="12" class="atable__empty">Loading…</td></tr>';

  let payload;
  try {
    payload = await adminFetch(`/marketing/campaigns?days=${encodeURIComponent(d)}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="12" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — campaigns appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    $('[data-cg-cards]').hidden = true;
    return;
  }

  paint(payload);
  loadSpend();
}

function paint({ data, meta }) {
  const cards = $('[data-cg-cards]');
  const body = $('[data-cg-body]');

  cards.hidden = false;
  setText('[data-cg-spend]', meta.spendTaka > 0 ? taka(meta.spendTaka) : '—');
  setText('[data-cg-ad-revenue]', taka(meta.adRevenueTaka));
  // Share of revenue, not of orders: five tiny ad orders out of six total
  // reads as "83% of orders" and would flatter a campaign that sold pennies.
  setText('[data-cg-ad-share]', meta.revenueTaka > 0
    ? `${Math.round((meta.adRevenueTaka / meta.revenueTaka) * 100)}%`
    : '—');
  setText('[data-cg-ad-orders]', String(meta.adOrders));
  setText('[data-cg-roas-delivered]', meta.roasDelivered != null ? `৳ ${meta.roasDelivered}` : '—');
  setText('[data-cg-sub]', `${meta.totalOrders} order${meta.totalOrders === 1 ? '' : 's'} in the last ${meta.days} days`
    + (meta.spendTaka > 0 ? `, ${taka(meta.spendTaka)} spent.` : '.'));

  if (!data.length) {
    body.innerHTML = `<tr><td colspan="12" class="atable__empty">
      No orders in this period yet. Rows appear as orders arrive — each one
      remembers which ad sold it, or that none did.</td></tr>`;
    return;
  }

  body.innerHTML = data.map((r) => `
    <tr${r.spendOnly ? ' class="cgrow--spend-only"' : ''}>
      <td>
        ${r.campaign === '(organic)'
          ? '<span class="atable__sub">Organic — no ad involved</span>'
          : `<strong class="cgtable__key">${escapeHtml(r.campaign)}</strong>`}
        ${[r.source, r.medium].filter(Boolean).length
          ? `<span class="atable__sub">${escapeHtml([r.source, r.medium].filter(Boolean).join(' · '))}</span>`
          : ''}
      </td>
      <td class="atable__num">${r.spendTaka > 0 ? taka(r.spendTaka) : '<span class="cgmuted">—</span>'}</td>
      <td class="atable__num">${roas(r)}</td>
      <td class="atable__num">${r.costPerDelivered != null ? taka(r.costPerDelivered) : '—'}</td>
      <td class="atable__num">${r.deliveredTaka ? `<strong>${taka(r.deliveredTaka)}</strong>` : '—'}</td>
      <td class="atable__num">${r.orders}</td>
      <td class="atable__num">${r.delivered || '—'}</td>
      <td class="atable__num">${
        // A cancel rate worth worrying about should look worrying: a third or
        // more of a campaign's orders cancelling is the junk-traffic signature.
        r.cancelled > 0 && r.cancelled >= r.orders / 3
          ? `<span class="apill apill--bad">${r.cancelled}</span>`
          : (r.cancelled || '—')
      }</td>
      <td class="atable__num">${r.returned || '—'}</td>
      <td class="atable__num">${taka(r.revenueTaka)}</td>
      <td class="atable__num">${r.costPerOrder != null ? taka(r.costPerOrder) : '—'}</td>
      <td class="atable__sub">${when(r.lastOrderAt)}</td>
    </tr>`).join('');
}

/**
 * Back per taka, on DELIVERED value — with what was placed beside it, because
 * the gap between the two is the whole point of the column.
 */
function roas(r) {
  if (r.roasDelivered == null) return '—';

  const good = r.roasDelivered >= 1;
  return `<span class="${good ? '' : 'apill apill--bad'}">৳ ${r.roasDelivered}</span>`
    + `<span class="atable__sub">৳ ${r.roas} placed</span>`;
}

/* ---- the spend section ------------------------------------------------- */

async function loadSpend() {
  let payload;
  try {
    payload = await adminFetch(`/marketing/ad-spend?days=${encodeURIComponent(days())}`);
  } catch (err) {
    setText('[data-cg-spend-status]', err.status === 403
      ? 'Ad spend is not visible to this account.'
      : 'Could not read the ad spend settings.');
    return;
  }

  paintSpend(payload.data);
}

function paintSpend(d) {
  const s = d.settings ?? {};

  // The status line is the whole setup in one sentence: what is missing, or
  // when it last worked.
  const status = !s.accountId
    ? 'No ad account connected yet — open "Where the spend is read from" below and add the account id.'
    : s.lastError
      ? s.lastError
      : s.lastSyncAt
        ? `Last read from Meta ${when(s.lastSyncAt)}${s.accountName ? ` · ${s.accountName}` : ''}`
          + `${s.currency ? ` · billed in ${s.currency}` : ''}`
        : 'Connected. Press Sync from Meta to read the spend.';

  setText('[data-cg-spend-status]', status);

  const account = $('[data-cg-account]');
  if (account && document.activeElement !== account) account.value = s.accountId ?? '';

  const rate = $('[data-cg-rate]');
  const rateField = $('[data-cg-rate-field]');
  // The rate only exists as a question when the account is not billed in taka.
  if (rateField) rateField.hidden = !s.currency || s.currency === 'BDT';
  if (rate && document.activeElement !== rate) rate.value = s.takaPerUnit ?? '';
  setText('[data-cg-currency]', s.currency ?? 'unit');

  paintRows(d.rows ?? []);
  paintUnmatched(d.byCampaign ?? []);
}

function paintRows(rows) {
  const body = $('[data-cg-rows]');
  if (!body) return;

  body.innerHTML = rows.length
    ? rows.map((r) => `
      <tr>
        <td>${escapeHtml(r.date ?? '')}</td>
        <td>${escapeHtml(r.campaign)}</td>
        <td class="atable__num">${taka(r.taka)}${
          r.currency !== 'BDT' ? `<span class="atable__sub">${escapeHtml(`${r.amount} ${r.currency}`)}</span>` : ''}</td>
        <td>${r.source === 'manual' ? 'Typed here' : 'Meta'}</td>
        <td>${r.source === 'manual'
          ? `<button type="button" class="alink-btn alink-btn--danger" data-cg-m-del="${r.id}">Remove</button>`
          : ''}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="atable__empty">Nothing recorded for this period.</td></tr>';
}

/**
 * Campaigns that spent money and matched no order.
 *
 * Shown only when there are some: a permanent empty panel about a problem
 * nobody has is furniture.
 */
function paintUnmatched(byCampaign) {
  const wrap = $('[data-cg-unmatched]');
  const host = $('[data-cg-map]');
  if (!wrap || !host) return;

  const rows = $('[data-cg-body]');
  const known = new Set([...rows.querySelectorAll('.cgtable__key')].map((el) => flat(el.textContent)));
  const orphans = byCampaign.filter((c) => c.spendTaka > 0 && !known.has(flat(c.utm)));

  wrap.hidden = orphans.length === 0;
  if (!orphans.length) return;

  host.innerHTML = orphans.map((c) => `
    <div class="cgmap__row">
      <span class="cgmap__name">${escapeHtml(c.names[0] ?? c.utm)}</span>
      <span class="cgmap__spend">${taka(c.spendTaka)} over ${c.days} day${c.days === 1 ? '' : 's'}</span>
      <input class="input-gr" aria-label="${escapeHtml(`utm_campaign for ${c.names[0] ?? c.utm}`)}"
             data-cg-map-key="${escapeHtml(c.keys[0] ?? '')}" placeholder="utm_campaign on the ad's link">
    </div>`).join('')
    + '<div class="afilters__actions"><button type="button" class="btn-gr" data-cg-map-save>Save the tags</button></div>';
}

/** Campaign names and utm tags compared the way the server compares them. */
function flat(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ---- actions ----------------------------------------------------------- */

async function sync() {
  const btn = $('[data-cg-sync]');
  btn.disabled = true;
  btn.textContent = 'Reading from Meta…';
  message(null);

  try {
    const payload = await adminFetch('/marketing/ad-spend/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: Number(days()) > 30 ? 30 : 7 }),
    });
    const r = payload.data;

    // A refusal from Meta is an ANSWER this screen shows in words — the
    // sentence names the permission or the key that has to change.
    message(r.ok
      ? `Read ${r.rows} day${r.rows === 1 ? '' : 's'} of spend across ${r.campaigns} campaign${r.campaigns === 1 ? '' : 's'} — ${taka(r.spendTaka)}.`
      : r.message, r.ok);
    // load() refreshes the report and the spend section together; painting
    // an empty spend section here first would flash "nothing recorded".
    await load();
  } catch (err) {
    message(err.message || 'The sync could not be started.', false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sync from Meta';
  }
}

async function saveSettings() {
  const btn = $('[data-cg-save]');
  btn.disabled = true;

  try {
    await adminFetch('/marketing/ad-spend', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: $('[data-cg-account]').value.trim(),
        token: $('[data-cg-token]').value.trim() || null,
        removeToken: $('[data-cg-remove-token]').checked,
        takaPerUnit: $('[data-cg-rate]').value.trim() || null,
      }),
    });

    // Never leave a credential sitting in a form somebody can walk past.
    $('[data-cg-token]').value = '';
    $('[data-cg-remove-token]').checked = false;
    message('Saved. Press Sync from Meta to read the spend.', true);
    await loadSpend();
  } catch (err) {
    message(err.message || 'Could not save that.', false);
  } finally {
    btn.disabled = false;
  }
}

async function addManual() {
  const campaign = $('[data-cg-m-campaign]').value.trim();
  const spendDate = $('[data-cg-m-date]').value;
  const amount = $('[data-cg-m-taka]').value.trim();

  if (!campaign || !spendDate || amount === '') {
    message('A campaign, a date and an amount are all needed.', false);
    return;
  }

  try {
    const payload = await adminFetch('/marketing/ad-spend/rows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign, spendDate, taka: Number(amount) }),
    });
    $('[data-cg-m-taka]').value = '';
    paintSpend(payload.data);
    await load();
    message('Added.', true);
  } catch (err) {
    message(err.message || 'Could not add that.', false);
  }
}

async function removeManual(id) {
  try {
    const payload = await adminFetch(`/marketing/ad-spend/rows/${encodeURIComponent(id)}`, { method: 'DELETE' });
    paintSpend(payload.data);
    await load();
  } catch (err) {
    message(err.message || 'Could not remove that.', false);
  }
}

async function saveMap() {
  const map = {};
  for (const input of document.querySelectorAll('[data-cg-map-key]')) {
    const key = input.dataset.cgMapKey;
    const value = input.value.trim();
    if (key && value) map[key] = value;
  }

  if (!Object.keys(map).length) {
    message('Type the utm_campaign tag beside at least one campaign first.', false);
    return;
  }

  try {
    await adminFetch('/marketing/ad-spend/map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map }),
    });
    message('Tied. The spend now counts against those campaigns.', true);
    await load();
  } catch (err) {
    message(err.message || 'Could not save the tags.', false);
  }
}

/* ---- pieces ------------------------------------------------------------ */

function message(text, ok) {
  const box = $('[data-cg-sync-msg]');
  if (!box) return;
  box.hidden = !text;
  box.textContent = text ?? '';
  box.className = `cgmsg${text ? (ok ? ' cgmsg--ok' : ' cgmsg--bad') : ''}`;
}

function taka(n) { return `৳ ${Number(n || 0).toLocaleString('en-BD')}`; }

function when(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).replace(' ', 'T'));
  return Number.isNaN(+d) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function setText(sel, v) { const el = $(sel); if (el) el.textContent = v; }
