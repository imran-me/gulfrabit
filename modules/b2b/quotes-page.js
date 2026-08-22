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
import { canDelete, confirmDelete, toast } from '../admin/admin-delete.js';

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

  // `deleted` is a place, not a status — a deleted request keeps whatever
  // status it had, so it goes on its own parameter rather than pretending to
  // be a sixth value of `status`.
  const qs = status === 'deleted'
    ? 'deleted=1'
    : `status=${encodeURIComponent(status)}`;

  let payload;
  try {
    payload = await adminFetch(`/quotes?${qs}`);
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
  const inTrash = document.querySelector('[data-q-filters]').status.value === 'deleted';

  document.querySelector('[data-q-count]').textContent =
    `${meta.openCount} waiting on us · ${meta.total} shown`
    + (meta.deletedCount ? ` · ${meta.deletedCount} deleted` : '');

  if (!data.length) {
    body.innerHTML = `<tr><td colspan="7" class="atable__empty">${
      inTrash
        ? 'Nothing has been deleted. Requests you delete land here, and can be put back.'
        : 'Nothing here.'
    }</td></tr>`;
    return;
  }

  body.innerHTML = data.map((q) => `
    <tr class="${q.deletedAt ? 'is-deleted' : ''}">
      <td>${escapeHtml(q.reference)}</td>
      <td>
        <strong class="atable__name">${escapeHtml(q.company)}</strong>
        ${q.notes ? `<div class="atable__sub">${escapeHtml(q.notes.slice(0, 70))}</div>` : ''}
      </td>
      <td>
        ${escapeHtml(q.contactName)}
        <div class="atable__sub">${escapeHtml(q.phone)}</div>
      </td>
      <td class="atable__num">
        ${q.lines
          ? `<button class="alink-btn" type="button" data-lines="${escapeHtml(q.reference)}"
                     aria-expanded="false">${q.lines}</button>`
          : '0'}
      </td>
      <td class="atable__num">৳ ${Number(q.indicativeTaka).toLocaleString('en-BD')}</td>
      <td>${waiting(q)}</td>
      <td>${
        // A deleted request offers one thing. Its stage moves are not drawn:
        // "Quote sent" on a request nobody can see is an offer to do work that
        // will not reach anyone.
        q.deletedAt
          ? (canDelete()
              ? `<button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
                         data-q-restore="${escapeHtml(q.reference)}">Restore</button>`
              : '<span class="atable__sub">Deleted</span>')
          : `${(NEXT[q.status] || []).map(([to, label]) => `
              <button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
                      data-move="${escapeHtml(q.reference)}" data-to="${to}">${escapeHtml(label)}</button>`).join(' ')}
             ${canDelete()
               ? `<button class="alink-btn alink-btn--danger" type="button"
                          data-q-del="${escapeHtml(q.reference)}">Delete</button>`
               : ''}`
      }</td>
    </tr>
    ${lineRow(q)}`).join('');

  body.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => move(btn.dataset.move, btn.dataset.to, btn));
  });

  body.querySelectorAll('[data-q-del]').forEach((btn) => {
    btn.addEventListener('click', () => remove(btn, data.find((q) => q.reference === btn.dataset.qDel)));
  });

  body.querySelectorAll('[data-q-restore]').forEach((btn) => {
    btn.addEventListener('click', () => putBack(btn));
  });

  body.querySelectorAll('[data-lines]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = body.querySelector(`[data-lines-for="${CSS.escape(btn.dataset.lines)}"]`);
      if (!row) return;
      row.hidden = !row.hidden;
      btn.setAttribute('aria-expanded', String(!row.hidden));
    });
  });
}

/**
 * What the customer actually asked for, one row down.
 *
 * Inline rather than on its own page: the desk works this list top to bottom
 * against a phone, and losing the queue to read one request means finding your
 * place again afterwards. Collapsed by default so the inbox still reads as an
 * inbox.
 *
 * The unit figure is labelled "indicative" here exactly as it is on the
 * storefront. It is what the site quoted as a guide, not a price anybody has
 * agreed — and replacing it with a real one is the entire job of this desk.
 */
function lineRow(q) {
  if (!q.items?.length) return '';

  return `
    <tr class="aquote-lines" data-lines-for="${escapeHtml(q.reference)}" hidden>
      <td colspan="7">
        <table class="atable atable--tight">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">SKU</th>
              <th scope="col">Qty</th>
              <th scope="col">Indicative unit</th>
              <th scope="col">Indicative line</th>
            </tr>
          </thead>
          <tbody>
            ${q.items.map((i) => `
              <tr>
                <td>${escapeHtml(i.title)}</td>
                <td class="atable__sub">${escapeHtml(i.sku || '—')}</td>
                <td class="atable__num">${i.qty}</td>
                <td class="atable__num">৳ ${Number(i.indicativeUnitTaka).toLocaleString('en-BD')}</td>
                <td class="atable__num">৳ ${Number(i.indicativeUnitTaka * i.qty).toLocaleString('en-BD')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${q.notes ? `<p class="admin__sub" style="margin:var(--space-3) 0 0"><strong>Their note:</strong> ${escapeHtml(q.notes)}</p>` : ''}
        ${q.email ? `<p class="admin__sub" style="margin:var(--space-2) 0 0">Reply to <a href="mailto:${escapeHtml(q.email)}">${escapeHtml(q.email)}</a></p>` : ''}
      </td>
    </tr>`;
}

/**
 * How long it has been sitting, coloured past a day.
 *
 * A B2B enquiry that waits 48 hours is usually one that has already phoned
 * somebody else, so the number is the point of this screen.
 */
/* ---- Deleting -----------------------------------------------------------
   The inbox needed somewhere to put junk. Submitting an RFQ is public, which
   is the right call — procurement staff ask before they sign up — and the
   cost of it is spam that used to sit in the list forever or get marked
   `lost`. `lost` means a real lead went to a competitor and is a number
   somebody reports on; filling it with junk makes the win rate meaningless. */

async function remove(btn, q) {
  const ok = await confirmDelete({
    title: `Delete ${q?.reference ?? 'this request'}?`,
    body: q?.lines
      ? `${q.company} — ${q.lines} line${q.lines === 1 ? '' : 's'}. The lines go with it and come `
        + 'back with it, so a genuine enquiry deleted by mistake returns whole.'
      : 'It leaves the inbox. This is not the same as marking it Lost, which is for a real lead.',
    confirm: 'Delete request',
  });
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = 'Deleting…';

  try {
    const { message } = await adminFetch(
      `/quotes/${encodeURIComponent(q.reference)}`, { method: 'DELETE' });
    toast(message || `${q.reference} deleted.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Delete';
    return toast(err.message, false);
  }

  load();
}

async function putBack(btn) {
  const ref = btn.dataset.qRestore;
  btn.disabled = true;
  btn.textContent = 'Restoring…';

  try {
    const { message } = await adminFetch(
      `/quotes/${encodeURIComponent(ref)}/restore`, { method: 'POST' });
    toast(message || `${ref} is back in the inbox.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Restore';
    return toast(err.message, false);
  }

  load();
}

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
