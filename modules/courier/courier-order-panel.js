/**
 * courier-order-panel.js — the courier block on the admin order screen.
 *
 * SELF-MOUNTING, LIKE THE STOREFRONT'S BUNDLE BLOCK
 * -------------------------------------------------
 * Admin's order fragment has no courier markup in it. This file finds the
 * order-detail grid and appends its own section, so deleting modules/courier/
 * and its two lines in tools/assemble.py removes the feature with no orphan
 * `<div>` left in somebody else's fragment.
 *
 * WHAT IT REFUSES TO PRETEND
 * --------------------------
 * No courier here has API credentials yet (context.md 8b/B2). So a courier that
 * cannot be booked automatically says so, on the row, in words — rather than
 * being hidden, greyed out, or worse, offered as though pressing the button
 * would summon a rider. Assigning still works: staff type the tracking number,
 * which is how most Bangladeshi merchants already operate.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

const STATUS_STEPS = [
  ['picked_up', 'Picked up'],
  ['in_transit', 'In transit'],
  ['delivered', 'Delivered'],
  ['failed', 'Attempt failed'],
  ['returned', 'Returned'],
  ['cancelled', 'Cancelled'],
];

/**
 * A courier status as a person would say it.
 *
 * The two statuses missing from STATUS_STEPS — `draft` and `booked` — are set
 * by the system rather than chosen by staff, so they are not offered in the
 * dropdown but still have to be readable when displayed. The fallback turns
 * any of them into words rather than showing `in_transit` with its underscore.
 */
const STATUS_LABELS = Object.fromEntries(STATUS_STEPS);

function statusLabel(status) {
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  const words = String(status || '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

let couriers = [];
let consignments = [];

document.addEventListener('admin:ready', init);

function orderNumber() {
  return new URLSearchParams(location.search).get('no');
}

async function init() {
  const grid = document.querySelector('.aorder');
  if (!grid || !orderNumber()) return;   // not the order-detail screen

  grid.insertAdjacentHTML('beforeend', `
    <section class="acard" aria-labelledby="cour-head" data-courier-panel>
      <h2 class="h5" id="cour-head">Courier</h2>
      <div data-courier-body><p class="admin__sub">Loading…</p></div>
    </section>`);

  try {
    [couriers, consignments] = await Promise.all([
      adminFetch('/couriers').then((r) => r.data),
      adminFetch(`/orders/${encodeURIComponent(orderNumber())}/consignments`).then((r) => r.data),
    ]);
  } catch (err) {
    return paint(`<p class="admin__sub">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — courier assignment appears once the API is live.'
        : escapeHtml(err.message)
    }</p>`);
  }

  render();
}

function paint(html) {
  const body = document.querySelector('[data-courier-body]');
  if (body) body.innerHTML = html;
}

function render() {
  const open = consignments.find((c) => !['delivered', 'returned', 'cancelled'].includes(c.status));
  paint(open ? openConsignment(open) : assignForm() + history());
  wire();
}

function openConsignment(c) {
  const link = c.trackingUrl
    ? `<a href="${escapeHtml(c.trackingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.trackingNumber || 'track')}</a>`
    : escapeHtml(c.trackingNumber || 'no tracking number yet');

  return `
    <dl class="akv">
      <div class="akv__row"><dt>Courier</dt><dd>${escapeHtml(c.courier || '—')}</dd></div>
      <div class="akv__row"><dt>Tracking</dt><dd>${link}</dd></div>
      <div class="akv__row"><dt>Status</dt><dd><span class="apill apill--label apill--info">${escapeHtml(statusLabel(c.status))}</span></dd></div>
      ${c.costTaka != null ? `<div class="akv__row"><dt>Courier cost</dt><dd>৳ ${Number(c.costTaka).toLocaleString('en-BD')}</dd></div>` : ''}
      ${c.codTaka ? `<div class="akv__row"><dt>COD to collect</dt><dd>৳ ${Number(c.codTaka).toLocaleString('en-BD')}${c.codRemitted ? ' (remitted)' : ' — not yet remitted'}</dd></div>` : ''}
      <div class="akv__row"><dt>Handed over</dt><dd>${when(c.handedOverAt)} by ${escapeHtml(c.assignedBy || '—')}</dd></div>
    </dl>

    ${eventList(c.events)}

    <form class="arefund-form" data-status-form data-consignment="${c.id}">
      <p class="admin__sub" style="flex:1 1 100%">
        Recording a status here is <strong>you</strong> saying it happened — this courier has no
        integration, so nothing is confirmed by them.
      </p>
      <div class="afilters__field">
        <label for="c-status">Mark as</label>
        <select class="select-gr" id="c-status" name="status">
          ${STATUS_STEPS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div class="afilters__field">
        <label for="c-loc">Where (optional)</label>
        <input class="input-gr" id="c-loc" name="location" type="text" placeholder="e.g. Dhaka hub">
      </div>
      <button class="btn-gr btn-primary-gr btn-sm-gr" type="submit">Record</button>
    </form>`;
}

function assignForm() {
  if (!couriers.length) {
    return '<p class="admin__sub">No couriers are switched on. Add one before assigning parcels.</p>';
  }

  return `
    <form class="arefund-form" data-assign-form style="border-top:0;padding-top:0">
      <div class="afilters__field afilters__field--wide">
        <label for="c-courier">Courier</label>
        <select class="select-gr" id="c-courier" name="courierKey">
          ${couriers.map((c) => `
            <option value="${escapeHtml(c.key)}">${escapeHtml(c.name)}${
              // Said on the row rather than hidden. A courier you cannot book
              // automatically is still a courier you can hand a parcel to.
              c.manualOnly ? ' — record tracking by hand' : ''
            }</option>`).join('')}
        </select>
      </div>
      <div class="afilters__field">
        <label for="c-track">Tracking number</label>
        <input class="input-gr" id="c-track" name="trackingNumber" type="text" placeholder="If you have it">
      </div>
      <div class="afilters__field">
        <label for="c-cost">Courier charges us (৳)</label>
        <input class="input-gr" id="c-cost" name="costTaka" type="number" step="0.01" min="0" placeholder="Optional">
      </div>
      <button class="btn-gr btn-primary-gr btn-sm-gr" type="submit">Hand over</button>
      <p class="admin__sub" style="flex:1 1 100%">
        No courier has API credentials configured yet, so nothing is booked automatically.
        This records the handover and the tracking number you were given.
      </p>
    </form>`;
}

function history() {
  if (!consignments.length) return '';
  return `
    <h3 class="h6" style="margin-top:var(--space-5)">Earlier attempts</h3>
    <ul class="arefunds" role="list">
      ${consignments.map((c) => `
        <li class="arefund">
          <div><strong>${escapeHtml(c.courier || '—')}</strong> · ${escapeHtml(statusLabel(c.status))}</div>
          <div class="atable__sub">${escapeHtml(c.trackingNumber || 'no tracking number')} · ${when(c.handedOverAt)}</div>
        </li>`).join('')}
    </ul>`;
}

function eventList(events = []) {
  if (!events.length) return '';
  return `
    <ol class="atimeline" style="margin-top:var(--space-4)">
      ${events.map((e) => `
        <li class="atimeline__item">
          <div class="atimeline__what"><strong>${escapeHtml(statusLabel(e.status))}</strong>${
            e.location ? ` · ${escapeHtml(e.location)}` : ''
          }</div>
          <div class="atimeline__who">${
            // 'staff' vs 'courier' matters: it is the difference between what a
            // carrier scanned and what one of us typed.
            e.source === 'courier' ? 'Courier scan' : escapeHtml(e.actor || 'Staff')
          } · ${when(e.at)}</div>
          ${e.description ? `<div class="atimeline__note">${escapeHtml(e.description)}</div>` : ''}
        </li>`).join('')}
    </ol>`;
}

function wire() {
  document.querySelector('[data-assign-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await adminFetch(`/orders/${encodeURIComponent(orderNumber())}/consignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courierKey: f.courierKey.value,
          trackingNumber: f.trackingNumber.value.trim() || null,
          costTaka: f.costTaka.value ? Number(f.costTaka.value) : null,
        }),
      });
    } catch (err) {
      btn.disabled = false;
      return paintError(err.message);
    }
    location.reload();
  });

  document.querySelector('[data-status-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await adminFetch(`/consignments/${f.dataset.consignment}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: f.status.value,
          location: f.location.value.trim() || null,
        }),
      });
    } catch (err) {
      btn.disabled = false;
      return paintError(err.message);
    }
    // Reload: a delivered scan also moves the ORDER status, and re-deriving
    // that in the browser is how the screen starts disagreeing with the server.
    location.reload();
  });
}

function paintError(message) {
  const el = document.querySelector('[data-order-error]');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
