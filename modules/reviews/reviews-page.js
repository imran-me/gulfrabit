/**
 * reviews-page.js — the moderation queue.
 *
 * The merchant chose to read every review before it appears, so this screen is
 * the only way anything reaches a product page. It is built to be worked, not
 * browsed: the queue is what opens, oldest first, and the two buttons that
 * matter are on every row.
 *
 * Publishing and rejecting both recompute the product's rating server-side —
 * see ReviewService::recount(). Nothing on this screen writes a number.
 */

import { adminFetch } from '/modules/admin/backend/api.js';
import { escapeHtml } from '/modules/admin/admin-shell.js';
import { canDelete, confirmDelete, toast } from '/modules/admin/admin-delete.js';

const TABS = [
  ['pending', 'Waiting'],
  ['published', 'Published'],
  ['rejected', 'Rejected'],
];

let status = 'pending';
let page = 1;
let meta = {};

document.addEventListener('admin:ready', init);

function init() {
  if (!document.querySelector('[data-rv-list]')) return;

  document.querySelector('[data-rv-tabs]').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-rv-tab]');
    if (!tab) return;

    status = tab.dataset.rvTab;
    page = 1;
    load();
  });

  document.querySelector('[data-rv-list]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rv-act]');
    if (!btn) return;

    const { rvAct: act, rvId: id } = btn.dataset;

    if (act === 'delete') return remove(id, btn);

    moderate(id, act, btn);
  });

  document.querySelector('[data-rv-prev]').addEventListener('click', () => { page -= 1; load(); });
  document.querySelector('[data-rv-next]').addEventListener('click', () => { page += 1; load(); });

  paintTabs();
  load();
}

async function load() {
  const host = document.querySelector('[data-rv-list]');
  host.innerHTML = '<p class="admin__sub">Loading reviews…</p>';

  let res;
  try {
    res = await adminFetch(`/reviews?status=${status}&page=${page}`);
  } catch (err) {
    host.innerHTML = `<p class="admin__sub">${escapeHtml(err.message)}</p>`;
    return;
  }

  meta = res.meta;
  paintTabs();

  document.querySelector('[data-rv-count]').textContent = meta.pendingCount
    ? `${meta.pendingCount} waiting to be read`
    : 'Nothing waiting';

  host.innerHTML = res.data.length
    ? res.data.map(row).join('')
    : `<p class="admin__sub">${empty()}</p>`;

  const pager = document.querySelector('[data-rv-pager]');
  pager.hidden = meta.pages <= 1;
  document.querySelector('[data-rv-page-label]').textContent = `Page ${meta.page} of ${meta.pages}`;
  document.querySelector('[data-rv-prev]').disabled = meta.page <= 1;
  document.querySelector('[data-rv-next]').disabled = meta.page >= meta.pages;
}

function empty() {
  if (status === 'pending') return 'Nothing waiting. Every review has been read.';
  if (status === 'published') return 'Nothing published yet.';
  return 'Nothing has been rejected.';
}

function paintTabs() {
  document.querySelector('[data-rv-tabs]').innerHTML = TABS.map(([key, label]) => `
    <button class="atab${status === key ? ' is-on' : ''}" type="button" data-rv-tab="${key}"
            aria-current="${status === key ? 'page' : 'false'}">
      ${label}${key === 'pending' && meta.pendingCount ? ` <span class="abadge">${meta.pendingCount}</span>` : ''}
    </button>`).join('');
}

function row(r) {
  // The order number is shown, not just the badge. "Verified" is a claim; the
  // order it came from is the thing that can be checked when a review looks
  // too good, and it is one click from here on the orders screen.
  const proof = r.verified && r.orderNumber
    ? `<a class="atable__sub" href="/admin/order?no=${encodeURIComponent(r.orderNumber)}">Verified · ${escapeHtml(r.orderNumber)}</a>`
    : '<span class="atable__sub">Not verified</span>';

  return `
    <article class="acard arv" data-rv-row="${r.id}">
      <div class="arv__head">
        <div class="arv__who">
          <strong>${escapeHtml(r.author)}</strong>
          <span class="arv__stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          ${proof}
        </div>
        <a class="atable__sub" href="/admin/products/edit?sku=${encodeURIComponent(r.product.sku ?? '')}">
          ${escapeHtml(r.product.title ?? 'Product removed')}
        </a>
      </div>

      ${r.title ? `<p class="arv__title">${escapeHtml(r.title)}</p>` : ''}
      <p class="arv__body">${escapeHtml(r.body)}</p>

      <div class="arv__foot">
        <span class="atable__sub">${when(r.submitted)}</span>
        <div class="arv__acts">
          ${r.status !== 'published'
            ? `<button class="btn-gr btn-primary-gr btn-sm-gr" type="button"
                       data-rv-act="published" data-rv-id="${r.id}">Publish</button>`
            : `<button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
                       data-rv-act="pending" data-rv-id="${r.id}">Unpublish</button>`}
          ${r.status !== 'rejected'
            ? `<button class="btn-gr btn-ghost-gr btn-sm-gr" type="button"
                       data-rv-act="rejected" data-rv-id="${r.id}">Reject</button>`
            : ''}
          ${canDelete()
            ? `<button class="btn-gr btn-ghost-gr btn-sm-gr aact-remove" type="button"
                       data-rv-act="delete" data-rv-id="${r.id}">Delete</button>`
            : ''}
        </div>
      </div>
    </article>`;
}

async function moderate(id, next, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const { message } = await adminFetch(`/reviews/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });

    toast(message);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    return toast(err.message, false);
  }

  // Stepping back when the last row on a page leaves it, the same as every
  // other list in the panel — a page past the end comes back empty with no
  // pager to get out of.
  if (page > 1 && document.querySelectorAll('[data-rv-row]').length === 1) page -= 1;

  load();
}

/**
 * Delete, which is for spam rather than disagreement.
 *
 * Rejecting is the reversible move and is what disagreement is for. This uses
 * the shared dialog with its reassurance removed, because a deleted review is
 * genuinely gone — there is no Deleted tab behind this screen.
 */
async function remove(id, btn) {
  const ok = await confirmDelete({
    title: 'Delete this review?',
    body: 'Use Reject for a review you simply do not want shown — that one can be undone. '
      + 'Deleting is for spam, and it is permanent.',
    undo: '',
    confirm: 'Delete review',
  });

  if (!ok) return;

  btn.disabled = true;

  try {
    const { message } = await adminFetch(`/reviews/${id}`, { method: 'DELETE' });
    toast(message);
  } catch (err) {
    btn.disabled = false;
    return toast(err.message, false);
  }

  if (page > 1 && document.querySelectorAll('[data-rv-row]').length === 1) page -= 1;

  load();
}

function when(iso) {
  if (!iso) return '';

  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);

  return days <= 0 ? 'today'
    : days === 1 ? 'yesterday'
      : days < 30 ? `${days} days ago`
        : then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
