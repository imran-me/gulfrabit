/**
 * quotes-page.js — the B2B desk's inbox.
 *
 * The list is the notification. There is no mail credential, so nothing is
 * sent when a request arrives; instead the dashboard carries a count that
 * cannot be dismissed and this list is ordered oldest-first, so the request
 * costing the most goodwill is the one at the top.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

const NEXT = {
  new:       [['reviewing', 'Start reviewing'], ['lost', 'Not proceeding']],
  reviewing: [['quoted', 'Quote sent'], ['lost', 'Not proceeding']],
  quoted:    [['won', 'Won'], ['lost', 'Lost']],
  won:       [],
  lost:      [],
};

document.addEventListener('admin:ready', init);

function init() {
  const form = document.querySelector('[data-q-filters]');
  if (!form) return;
  form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  load();
}

async function load() {
  const body = document.querySelector('[data-q-body]');
  const status = document.querySelector('[data-q-filters]').status.value;

  let payload;
  try {
    payload = await adminFetch(`/quotes?status=${encodeURIComponent(status)}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — requests appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    document.querySelector('[data-q-count]').textContent = '';
    return;
  }

  paint(payload);
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-q-body]');
  document.querySelector('[data-q-count]').textContent =
    `${meta.openCount} waiting on us · ${meta.total} shown`;

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="7" class="atable__empty">Nothing here.</td></tr>';
    return;
  }

  body.innerHTML = data.map((q) => `
    <tr>
      <td>${escapeHtml(q.reference)}</td>
      <td>
        <strong>${escapeHtml(q.company)}</strong>
        ${q.notes ? `<div class="atable__sub">${escapeHtml(q.notes.slice(0, 70))}</div>` : ''}
      </td>
      <td>
        ${escapeHtml(q.contactName)}
        <div class="atable__sub">${escapeHtml(q.phone)}</div>
      </td>
      <td class="atable__num">${q.lines}</td>
      <td class="atable__num">৳ ${Number(q.indicativeTaka).toLocaleString('en-BD')}</td>
      <td>${waiting(q)}</td>
      <td>${(NEXT[q.status] || []).map(([to, label]) => `
        <button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
                data-move="${escapeHtml(q.reference)}" data-to="${to}">${escapeHtml(label)}</button>`).join(' ')
        || '<span class="atable__sub">—</span>'}</td>
    </tr>`).join('');

  body.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => move(btn.dataset.move, btn.dataset.to, btn));
  });
}

/**
 * How long it has been sitting, coloured past a day.
 *
 * A B2B enquiry that waits 48 hours is usually one that has already phoned
 * somebody else, so the number is the point of this screen.
 */
function waiting(q) {
  const h = q.waitingHours;
  const label = h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
  return `<span class="apill apill--${h >= 24 ? 'bad' : 'wait'}">${label}</span>`;
}

async function move(reference, to, btn) {
  btn.disabled = true;
  try {
    await adminFetch(`/quotes/${encodeURIComponent(reference)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: to }),
    });
  } catch (err) {
    btn.disabled = false;
    const el = document.querySelector('[data-q-error]');
    el.textContent = err.message;
    el.hidden = false;
    return;
  }
  load();
}
