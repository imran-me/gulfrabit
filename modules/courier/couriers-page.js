/**
 * couriers-page.js — the parcel board.
 *
 * WHAT THIS SCREEN IS FOR
 * -----------------------
 * It used to be a read-only list of courier companies: a settings page you
 * visit once, when a new carrier is added. That is not a screen anybody needs
 * on a Tuesday morning. What they need is the queue — what is going out today,
 * what is with a rider, what came back — so the companies moved to their own
 * tab at the end and the parcels took the front.
 *
 * THE FIRST TAB IS NOT A CONSIGNMENT STATUS
 * -----------------------------------------
 * "Ready to hand over" lists ORDERS that are packed and have no live
 * consignment. It cannot be a parcel status because the parcel does not exist
 * yet — that is the point of the tab. Everything after it is a real
 * consignment stage. The server draws the same distinction (`kind` on each
 * row), so the table can hand a row to the right renderer without guessing.
 *
 * EVERY ROW CAN BE ACTED ON
 * -------------------------
 * The queue hands a parcel over from the row — courier, tracking number, done.
 * Every other stage carries the one button that moves that parcel forward.
 * Both post to the same endpoints the order screen uses, so there is one set of
 * rules and one audit trail; what is duplicated is the button, not the logic.
 *
 * An earlier version of this file sent people to the order screen to assign,
 * on the reasoning that one form is easier to keep correct than two. That was
 * true and it was still wrong: this tab is a queue, drained standing at a
 * counter with a rider waiting, and opening a page per parcel is what makes
 * staff close the board and reach for a notebook.
 *
 * The order screen keeps the fuller form — courier cost, notes, and the
 * statuses that need explaining (failed, returned). This board carries the
 * moves you make twenty times a morning.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

/**
 * The board's tabs, in the order a parcel passes through them. Mirrors
 * BOARD_STAGES in AdminCourierController — the server sends counts under these
 * exact keys.
 *
 * `accounts` is not a stage and carries no count: it is the old settings list,
 * kept and pushed to the end where a settings screen belongs.
 */
const STAGES = [
  { key: 'handover',   label: 'Ready to hand over' },
  { key: 'booked',     label: 'With courier' },
  { key: 'picked_up',  label: 'Picked up' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered',  label: 'Delivered' },
  { key: 'failed',     label: 'Attempt failed' },
  { key: 'returned',   label: 'Returned' },
  { key: 'cancelled',  label: 'Cancelled' },
];

const TONES = {
  delivered: 'ok',
  failed: 'bad',
  returned: 'bad',
  cancelled: 'bad',
  in_transit: 'info',
  picked_up: 'info',
  booked: 'info',
};

/**
 * The one status that moves a parcel forward from where it is — the good day.
 */
const NEXT_STATUS = {
  booked:     ['picked_up',  'Picked up'],
  picked_up:  ['in_transit', 'In transit'],
  in_transit: ['delivered',  'Delivered'],
};

/**
 * The bad day, behind a second click.
 *
 * `failed` deliberately leaves the ORDER alone: the parcel is still out there
 * and the courier will try again tomorrow. `returned` moves the order to
 * returned, because it is back on our shelf.
 *
 * Both ask what happened. A failed attempt with no note is a row that tells the
 * next person nothing — and the next person is the one who has to phone the
 * customer and explain.
 */
const OUTCOMES = [
  ['failed',    'Attempt failed'],
  ['returned',  'Returned to us'],
  ['cancelled', 'Cancel this parcel'],
];

/** Statuses a parcel cannot move on from. */
const CLOSED = ['delivered', 'returned', 'cancelled'];

let stage = 'handover';
let page = 1;
let couriers = [];

document.addEventListener('admin:ready', init);

function init() {
  if (!document.querySelector('[data-board-tabs]')) return;

  // State in the URL, same as the orders list: "the four parcels stuck in
  // failed" should be a link you can send someone.
  const params = new URLSearchParams(location.search);
  stage = STAGES.some((s) => s.key === params.get('stage')) || params.get('stage') === 'accounts'
    ? params.get('stage')
    : 'handover';
  page = Math.max(1, Number(params.get('page')) || 1);

  const search = document.querySelector('[data-board-search]');
  if (params.has('q')) search.q.value = params.get('q');

  search.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });

  document.querySelector('[data-board-tabs]').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-stage]');
    if (!tab) return;
    stage = tab.dataset.stage;
    page = 1;
    load();
  });

  document.querySelector('[data-board-prev]').addEventListener('click', () => { page--; load(); });
  document.querySelector('[data-board-next]').addEventListener('click', () => { page++; load(); });

  // Delegated to the tbody, which survives every repaint. Buttons are thrown
  // away on each load, and handlers bound to them would quietly stop working.
  document.querySelector('[data-board-body]').addEventListener('click', (e) => {
    const hand = e.target.closest('[data-handover]');
    if (hand) return handOver(hand);

    const step = e.target.closest('[data-advance]');
    if (step) return advance(step);
  });

  paintTabs({});
  load();
}

function searchTerm() {
  return document.querySelector('[data-board-search]')?.q.value.trim() || '';
}

async function load() {
  const q = searchTerm();

  const url = new URLSearchParams();
  if (stage !== 'handover') url.set('stage', stage);
  if (q) url.set('q', q);
  if (page > 1) url.set('page', String(page));
  history.replaceState(null, '', url.toString() ? `?${url}` : location.pathname);

  paintTabs(lastCounts);

  if (stage === 'accounts') return loadAccounts();

  setColumns(stage === 'handover' ? HANDOVER_COLUMNS : PARCEL_COLUMNS);
  setBody(`<tr><td colspan="8" class="atable__empty">Loading…</td></tr>`);

  let payload;
  try {
    payload = await adminFetch(`/consignments?${new URLSearchParams({ stage, q, page: String(page) })}`);
  } catch (err) {
    return setBody(`<tr><td colspan="8" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — parcels appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`);
  }

  paintBoard(payload);
}

let lastCounts = {};

function paintTabs(counts) {
  const host = document.querySelector('[data-board-tabs]');

  host.innerHTML = [...STAGES, { key: 'accounts', label: 'Courier accounts' }]
    .map(({ key, label }) => {
      const n = counts[key];
      const on = key === stage;
      return `
        <button class="atab${on ? ' is-on' : ''}" type="button" data-stage="${key}"
                aria-current="${on ? 'page' : 'false'}">
          ${escapeHtml(label)}${
            n === undefined ? '' : `<span class="atab__count">${n.toLocaleString('en-BD')}</span>`
          }
        </button>`;
    }).join('');
}

const HANDOVER_COLUMNS = ['Order', 'Customer', 'District', 'Stage', 'To collect', 'Waiting', 'Hand to courier'];
const PARCEL_COLUMNS = ['Order', 'Customer', 'Courier', 'Tracking', 'Status', 'COD', 'Handed over', 'Move on'];

function setColumns(columns) {
  document.querySelector('[data-board-head]').innerHTML =
    `<tr>${columns.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join('')}</tr>`;
}

function setBody(html) {
  document.querySelector('[data-board-body]').innerHTML = html;
}

function paintBoard({ data, meta }) {
  lastCounts = meta.counts || {};
  couriers = meta.couriers || [];
  paintTabs(lastCounts);

  const label = STAGES.find((s) => s.key === meta.stage)?.label ?? meta.stage;
  document.querySelector('[data-board-count]').textContent = meta.total === 0
    ? `Nothing in ${label.toLowerCase()}.`
    : `${meta.total.toLocaleString('en-BD')} parcel${meta.total === 1 ? '' : 's'} in ${label.toLowerCase()}`;

  if (!data.length) {
    setBody(`<tr><td colspan="8" class="atable__empty">${
      // An empty handover queue is the good outcome, and should read like one.
      meta.stage === 'handover'
        ? 'Nothing waiting. Every packed parcel is with a courier.'
        : `Nothing in ${escapeHtml(label.toLowerCase())}.`
    }</td></tr>`);
    return pager(meta);
  }

  setBody(data.map((r) => r.kind === 'order' ? handoverRow(r) : parcelRow(r)).join(''));
  pager(meta);
}

/**
 * One order waiting for a rider — handed over from the row itself.
 *
 * The courier picker and the tracking box are ON the row rather than behind a
 * link to the order screen, because this tab is a queue and a queue is drained
 * standing at a counter with a rider waiting. Opening a page per parcel is the
 * thing that makes staff stop using the board and go back to a notebook.
 *
 * The tracking number is optional here, exactly as it is on the order screen:
 * the slip often arrives after the rider does, and forcing a value at handover
 * pushes people into inventing one.
 */
function handoverRow(o) {
  const pickers = couriers.length
    ? `
      <select class="select-gr" data-courier aria-label="Courier for ${escapeHtml(o.orderNumber)}">
        ${couriers.map((c) => `<option value="${escapeHtml(c.key)}">${escapeHtml(c.name)}</option>`).join('')}
      </select>
      <input class="input-gr" data-tracking type="text" placeholder="Tracking no."
             aria-label="Tracking number for ${escapeHtml(o.orderNumber)}">
      <button class="btn-gr btn-primary-gr btn-sm-gr" type="button"
              data-handover="${escapeHtml(o.orderNumber)}">Hand over</button>`
    : '<span class="atable__sub">No couriers are switched on.</span>';

  return `
    <tr>
      <td><a href="${orderHref(o.orderNumber)}">${escapeHtml(o.orderNumber)}</a></td>
      <td>
        <div>${escapeHtml(o.customerName)}</div>
        <div class="atable__sub">${escapeHtml(o.customerPhone)}</div>
      </td>
      <td>${escapeHtml(o.district || '—')}</td>
      <td>${pill(o.status === 'ready_for_courier' ? 'Ready' : 'Packing', o.status === 'ready_for_courier' ? 'info' : 'wait')}</td>
      <td class="atable__num">${o.codTaka ? `৳ ${money(o.codTaka)}` : '<span class="atable__sub">Paid</span>'}</td>
      <td class="atable__sub">${waitingFor(o.placedAt)}</td>
      <td><div class="arow-actions">${pickers}</div></td>
    </tr>`;
}

function parcelRow(c) {
  const tracking = c.trackingUrl
    ? `<a href="${escapeHtml(c.trackingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.trackingNumber || 'track')}</a>`
    : escapeHtml(c.trackingNumber || '—');

  return `
    <tr>
      <td><a href="${orderHref(c.orderNumber)}">${escapeHtml(c.orderNumber || '—')}</a></td>
      <td>
        <div>${escapeHtml(c.customerName || '—')}</div>
        <div class="atable__sub">${escapeHtml(c.customerPhone || '')}</div>
      </td>
      <td>${escapeHtml(c.courier || '—')}</td>
      <td>${tracking}</td>
      <td>${pill(c.status.replace(/_/g, ' '), TONES[c.status] || 'wait')}</td>
      <td class="atable__num">${
        // Cash the courier is holding is money we have not been paid yet, and
        // saying so on the row is the difference between chasing it and
        // assuming it arrived.
        c.codTaka
          ? `৳ ${money(c.codTaka)}${c.codRemitted ? '' : '<div class="atable__sub">not remitted</div>'}`
          : '<span class="atable__sub">—</span>'
      }</td>
      <td class="atable__sub">${when(c.handedOverAt)}</td>
      <td>${parcelAction(c)}</td>
    </tr>`;
}

function parcelAction(c) {
  // Delivered, returned and cancelled are finished. The link still goes
  // somewhere useful — reading the order is usually why you are here.
  if (CLOSED.includes(c.status)) {
    return `<a class="atable__sub" href="${orderHref(c.orderNumber)}">Open</a>`;
  }

  const next = NEXT_STATUS[c.status];

  const forward = next
    ? `<button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
               data-advance="${c.id}" data-status="${next[0]}">${escapeHtml(next[1])}</button>`
    : '';

  // A failed attempt can be retried — it keeps the full outcome menu, and no
  // forward button, because "picked up" is not the next thing that happens to
  // a parcel a rider already came back with.
  const outcomes = OUTCOMES.filter(([s]) => s !== c.status);

  return `
    <div class="arow-actions">
      ${forward}
      <details class="amenu">
        <summary aria-label="Record an outcome for ${escapeHtml(c.orderNumber || 'this parcel')}">⋯</summary>
        <div class="amenu__list">
          ${outcomes.map(([s, label]) => `
            <button type="button" data-advance="${c.id}" data-status="${s}">${escapeHtml(label)}</button>`).join('')}
        </div>
      </details>
    </div>`;
}

/**
 * Hand one order to a courier, from the queue.
 *
 * The server moves the ORDER to "with courier" as part of this — see
 * ConsignmentService::assign. That is why the row leaves this tab afterwards:
 * it is no longer waiting for anybody.
 */
async function handOver(btn) {
  const row = btn.closest('tr');
  const courierKey = row.querySelector('[data-courier]').value;
  const trackingNumber = row.querySelector('[data-tracking]').value.trim();

  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    await adminFetch(`/orders/${encodeURIComponent(btn.dataset.handover)}/consignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courierKey,
        trackingNumber: trackingNumber || null,
        costTaka: null,
      }),
    });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Hand over';
    alert(err.message);
    return;
  }

  load();
}

/**
 * Move one parcel to its next status.
 *
 * Reloads rather than patching the row: a delivered scan also moves the ORDER,
 * and it changes which tab this parcel belongs to and every count above it.
 * Re-deriving that in the browser is how the screen starts disagreeing with
 * the database.
 */
async function advance(btn) {
  const status = btn.dataset.status;
  const original = btn.textContent;

  // The outcomes ask what happened; the forward steps do not. A parcel moving
  // to "in transit" needs no explanation — a parcel coming back does, and the
  // person who has to phone the customer tomorrow is the one who needs it.
  let description = null;
  if (OUTCOMES.some(([s]) => s === status)) {
    description = prompt('What happened? (recorded on the parcel, and visible on the order)');
    if (description === null) return;
    description = description.trim() || null;
  }

  btn.disabled = true;
  btn.textContent = 'Working…';

  try {
    await adminFetch(`/consignments/${btn.dataset.advance}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, location: null, description }),
    });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    alert(err.message);
    return;
  }

  load();
}

/** The old settings list, now one tab among the stages. */
async function loadAccounts() {
  setColumns(['Courier', 'Booking', 'Adapter', 'Support', 'Active']);
  setBody(`<tr><td colspan="5" class="atable__empty">Loading…</td></tr>`);
  document.querySelector('[data-board-count]').textContent = '';
  document.querySelector('[data-board-pager]').hidden = true;

  let data;
  try {
    ({ data } = await adminFetch('/couriers'));
  } catch (err) {
    return setBody(`<tr><td colspan="5" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — couriers appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`);
  }

  if (!data.length) {
    return setBody('<tr><td colspan="5" class="atable__empty">No couriers configured.</td></tr>');
  }

  setBody(data.map((c) => `
    <tr>
      <td><strong>${escapeHtml(c.name)}</strong><div class="atable__sub">${escapeHtml(c.key)}</div></td>
      <td>${
        // Three distinct states, named. "Manual" is not a failure — it is how
        // the business runs today — so it gets a neutral pill, not a red one.
        c.isConfigured
          ? '<span class="apill apill--ok">API connected</span>'
          : '<span class="apill apill--wait">Manual</span>'
      }</td>
      <td class="atable__sub">${c.hasDriver ? 'Driver available' : 'No adapter written'}</td>
      <td class="atable__sub">${escapeHtml(c.supportPhone || '—')}</td>
      <td>${c.isActive ? '<span class="apill apill--ok">On</span>' : '<span class="apill apill--wait">Off</span>'}</td>
    </tr>`).join(''));
}

function pager(meta) {
  const host = document.querySelector('[data-board-pager]');
  host.hidden = meta.lastPage <= 1;
  document.querySelector('[data-board-page]').textContent = `Page ${meta.currentPage} of ${meta.lastPage}`;
  document.querySelector('[data-board-prev]').disabled = meta.currentPage <= 1;
  document.querySelector('[data-board-next]').disabled = meta.currentPage >= meta.lastPage;
}

const orderHref = (no) => `/modules/admin/order.html?no=${encodeURIComponent(no || '')}`;
const money = (n) => Number(n).toLocaleString('en-BD');

/* apill--label: these are written phrases ("In transit"), and the stylesheet's
   default capitalisation would render them "In Transit". */
function pill(text, tone) {
  return `<span class="apill apill--label apill--${tone}">${escapeHtml(text)}</span>`;
}

/**
 * How long this parcel has been waiting, in days — the number that decides
 * whether it is a queue or a problem. Exact timestamps are on the order.
 */
function waitingFor(iso) {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
