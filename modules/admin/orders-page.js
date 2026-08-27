/**
 * orders-page.js — the order list, worked as a pipeline.
 *
 * Filter state lives in the URL, not in a variable. A colleague asking "which
 * orders are stuck in packing?" should be answerable by sending them a link,
 * and a reloaded page should not silently drop back to showing everything.
 *
 * THE STAGE BAR IS THE SCREEN
 * ---------------------------
 * The stage lives in a hidden input rather than the dropdown it replaced,
 * because a shop does not think "filter by status" — it thinks "who have I not
 * called yet, what is waiting to be packed, what is at the door". Those are
 * places, and a tab bar is what places look like. The dropdown was the same
 * data asking to be searched instead of walked.
 *
 * The counts come from the server with the rows, under the same search, so the
 * bar reads as an answer to the current question and not to a different one.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { canDelete, confirmDelete, toast } from './admin-delete.js';
import { STAGES, TRANSITION_LABELS, NEEDS_REASON, stageLabel, stageTone } from './order-stages.js';

/* `deleted` is a filter like any other so it lives in the URL with the rest:
   the Deleted tab has to survive a reload and be shareable, exactly as the
   stage tabs beside it are. It is a separate axis from `status` — a deleted
   order keeps the stage it was in, so restoring puts it back where it was. */
const FILTER_KEYS = ['q', 'status', 'paymentStatus', 'from', 'to', 'deleted'];
let page = 1;

/* The current page's rows, and which of them are ticked. Selection is cleared
   whenever the list reloads: after a bulk move the rows underneath are no
   longer the rows that were chosen, and a selection that survives that is a
   selection that acts on orders somebody did not mean to touch. */
let rows = [];
const selected = new Set();

document.addEventListener('admin:ready', init);

function init() {
  const form = document.querySelector('[data-orders-filters]');
  if (!form) return;

  paintTabs({});   // drawn immediately, counts filled in when they arrive

  // Restore from the URL so a shared or bookmarked link opens the same view.
  const params = new URLSearchParams(location.search);
  FILTER_KEYS.forEach((k) => { if (params.has(k) && form[k]) form[k].value = params.get(k); });
  page = Math.max(1, Number(params.get('page')) || 1);

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  document.querySelector('[data-orders-clear]')?.addEventListener('click', () => {
    form.reset();
    // reset() does not clear a hidden input's value the way it clears a visible
    // one — it restores the DEFAULT attribute, which is empty here, so the
    // stage genuinely goes back to "all". Stated because it looks like a bug.
    form.status.value = '';
    form.deleted.value = '';
    page = 1;
    load();
  });
  document.querySelector('[data-page-prev]')?.addEventListener('click', () => { page--; load(); });
  document.querySelector('[data-page-next]')?.addEventListener('click', () => { page++; load(); });

  // One listener on the bar rather than one per tab: the bar is repainted with
  // every load, and handlers attached to buttons that get replaced are handlers
  // that quietly stop working.
  document.querySelector('[data-orders-tabs]')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-trash]')) {
      // Entering the drawer clears the stage, because "cancelled orders that
      // are also deleted" is a question nobody has asked and a tab bar showing
      // two current tabs at once is a tab bar that has stopped explaining
      // where you are.
      form.deleted.value = '1';
      form.status.value = '';
      page = 1;
      return load();
    }

    const tab = e.target.closest('[data-stage]');
    if (!tab) return;
    form.deleted.value = '';
    form.status.value = tab.dataset.stage;
    page = 1;
    load();
  });

  // Same reasoning for the rows: delegated once to the tbody, which survives
  // every repaint, rather than re-bound to buttons that are thrown away.
  document.querySelector('[data-orders-body]')?.addEventListener('click', (e) => {
    const del = e.target.closest('[data-adel-id]');
    if (del) return remove([del.dataset.adelId], del);

    const back = e.target.closest('[data-arestore-id]');
    if (back) return putBack(back.dataset.arestoreId, back);

    const btn = e.target.closest('[data-move]');
    if (btn) move(btn);
  });

  document.querySelector('[data-orders-body]')?.addEventListener('change', (e) => {
    const box = e.target.closest('[data-pick]');
    if (!box) return;
    if (box.checked) selected.add(box.dataset.pick);
    else selected.delete(box.dataset.pick);
    paintBulk();
  });

  document.querySelector('[data-select-all]')?.addEventListener('change', (e) => {
    rows.forEach((o) => e.target.checked ? selected.add(o.orderNumber) : selected.delete(o.orderNumber));
    document.querySelectorAll('[data-pick]').forEach((b) => { b.checked = e.target.checked; });
    paintBulk();
  });

  document.querySelector('[data-bulk-clear]')?.addEventListener('click', clearSelection);

  document.querySelector('[data-bulk-actions]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bulk]');
    if (!btn) return;
    if (btn.dataset.bulk === 'print') return printSlips();
    if (btn.dataset.bulk === 'delete') return remove([...selected], btn);
    if (btn.dataset.bulk === 'restore') return putBackMany([...selected], btn);
    bulkMove(btn.dataset.bulk, btn);
  });

  load();
}

function currentFilters() {
  const form = document.querySelector('[data-orders-filters]');
  const out = {};
  FILTER_KEYS.forEach((k) => {
    const v = form[k]?.value.trim();
    if (v) out[k] = v;
  });
  return out;
}

/**
 * The stage bar. `all` first, then the pipeline in working order.
 *
 * Counts are rendered as a separate element and not baked into the label, so a
 * screen reader announces "Placed, 4 orders" rather than "Placed4".
 */
function paintTabs(counts) {
  const host = document.querySelector('[data-orders-tabs]');
  if (!host) return;

  const form = document.querySelector('[data-orders-filters]');
  const current = form?.status.value || '';
  const inTrash = !!form?.deleted.value;
  const tabs = [{ key: '', label: 'All orders' }, ...STAGES];

  const tab = (key, label, on, extraClass = '') => `
      <button class="atab${on ? ' is-on' : ''}${extraClass}" type="button" data-stage="${key}"
              aria-current="${on ? 'page' : 'false'}">
        ${escapeHtml(label)}${
          // No badge at all until the numbers land, rather than a flash of
          // zeroes that then corrects itself — a "0" that turns into "7" reads
          // as the screen having been wrong.
          counts[key || 'all'] === undefined
            ? ''
            : `<span class="atab__count">${counts[key || 'all'].toLocaleString('en-BD')}</span>`
        }
      </button>`;

  /* While the Deleted tab is open no stage tab is current, because you are not
     standing in a stage — you are standing in the drawer. Clicking any stage
     leaves the drawer, which is why `data-trash` is read as "leave" below. */
  host.innerHTML = tabs.map(({ key, label }) => tab(key, label, !inTrash && key === current)).join('')
    + `
      <button class="atab atab--trash${inTrash ? ' is-on' : ''}" type="button" data-trash
              aria-current="${inTrash ? 'page' : 'false'}">
        Deleted${
          counts.deleted === undefined
            ? ''
            : `<span class="atab__count">${counts.deleted.toLocaleString('en-BD')}</span>`
        }
      </button>`;
}

async function load() {
  const body = document.querySelector('[data-orders-body]');
  const filters = currentFilters();

  // Any reload — a filter, a page, a finished bulk move — replaces the rows
  // underneath, so a selection made against the old ones is meaningless and
  // dangerous to keep.
  clearSelection();

  // Mirror to the URL before fetching, so the address bar is right even if the
  // request is slow or fails.
  const qs = new URLSearchParams(filters);
  if (page > 1) qs.set('page', String(page));
  history.replaceState(null, '', qs.toString() ? `?${qs}` : location.pathname);

  body.innerHTML = `<tr><td colspan="10" class="atable__empty">Loading…</td></tr>`;

  let payload;
  try {
    payload = await adminFetch(`/orders?${new URLSearchParams({ ...filters, page: String(page) })}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="10" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — orders appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    document.querySelector('[data-orders-count]').textContent = '';
    document.querySelector('[data-orders-pager]').hidden = true;
    return;
  }

  paint(payload);
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-orders-body]');
  const count = document.querySelector('[data-orders-count]');

  paintTabs(meta.counts || {});

  const form = document.querySelector('[data-orders-filters]');
  const stage = form.status.value;
  const inTrash = !!form.deleted.value;
  count.textContent = meta.total === 0
    ? (inTrash ? 'Nothing deleted.' : 'No orders match these filters.')
    : `${meta.total.toLocaleString('en-BD')} ${inTrash ? 'deleted ' : ''}order${
        meta.total === 1 ? '' : 's'
      }${stage ? ` in ${stageLabel(stage).toLowerCase()}` : ''}`;

  if (!data.length) {
    // Named, because an empty stage is usually good news. "Nothing here" makes
    // an empty Placed tab look like a broken screen when it means every order
    // has been called.
    const inTrash = !!document.querySelector('[data-orders-filters]').deleted.value;
    body.innerHTML = `<tr><td colspan="10" class="atable__empty">${
      inTrash
        ? 'Nothing has been deleted. Orders you delete land here, and can be put back.'
        : stage
          ? `Nothing in ${escapeHtml(stageLabel(stage).toLowerCase())} right now.`
          : 'Nothing here. Try widening the filters.'
    }</td></tr>`;
    document.querySelector('[data-orders-pager]').hidden = true;
    return;
  }

  // Held so the bulk bar can work out which moves are legal for the whole
  // selection without asking the server again.
  rows = data;

  body.innerHTML = data.map((o) => `
    <tr class="${o.deletedAt ? 'is-deleted' : ''}">
      <td class="atable__pick">
        <input type="checkbox" data-pick="${escapeHtml(o.orderNumber)}"
               ${selected.has(o.orderNumber) ? 'checked' : ''}
               aria-label="Select ${escapeHtml(o.orderNumber)}">
      </td>
      <td><a href="/admin/order?no=${encodeURIComponent(o.orderNumber)}">${escapeHtml(o.orderNumber)}</a></td>
      <td class="atable__name">
        <div>${escapeHtml(o.customerName)}</div>
        <div class="atable__sub">${escapeHtml(o.customerPhone)}</div>
      </td>
      <td>${escapeHtml(o.district || '—')}</td>
      <td class="atable__num">${o.itemCount}</td>
      <td class="atable__num">৳ ${Number(o.totalTaka).toLocaleString('en-BD')}</td>
      <td>${pill(o.paymentStatus, paymentTone(o.paymentStatus))}</td>
      <td>${pill(stageLabel(o.status), stageTone(o.status), true)}${preorderNote(o)}</td>
      <td class="atable__sub">${formatWhen(o.placedAt)}</td>
      <td>${rowAction(o)}</td>
    </tr>`).join('');

  paintBulk();

  const pager = document.querySelector('[data-orders-pager]');
  pager.hidden = meta.lastPage <= 1;
  document.querySelector('[data-page-label]').textContent = `Page ${meta.currentPage} of ${meta.lastPage}`;
  document.querySelector('[data-page-prev]').disabled = meta.currentPage <= 1;
  document.querySelector('[data-page-next]').disabled = meta.currentPage >= meta.lastPage;
}

/**
 * "Pre-order · 14 Sep", under the stage pill.
 *
 * Sits beside the stage rather than replacing it, because a pre-order still
 * moves through the same pipeline — it is confirmed, it is packed, it goes out
 * — it simply cannot start until a shipment lands. The stage says where it is;
 * this says why it is not moving.
 *
 * Once the date has passed it flips to "stock due" in the alert tone, because
 * at that point the order IS actionable and the thing that was an explanation
 * has become a job.
 */
function preorderNote(o) {
  if (!o.shipsOn) return '';

  const when = new Date(`${o.shipsOn}T00:00:00`)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return o.preorderDue
    ? `<div class="atable__sub"><strong>Stock due — ${escapeHtml(when)}</strong></div>`
    : `<div class="atable__sub">Pre-order · ${escapeHtml(when)}</div>`;
}

/* Tone carries meaning that colour alone would not: the label is always the
   word, so this is reinforcement rather than the only signal. Order stages get
   theirs from order-stages.js, next to their labels. */
function paymentTone(s) {
  if (s === 'paid') return 'ok';
  if (s === 'failed') return 'bad';
  if (s === 'refunded') return 'info';
  return 'wait';
}
/* ---- Working several orders at once ------------------------------------ */

/**
 * The bulk bar: what can be done to EVERY order currently ticked.
 *
 * The moves offered are the INTERSECTION of what each selected order allows,
 * not the union. Offering "Start packing" because three of eight orders could
 * take it would half-work — five would refuse, and a bulk action that
 * half-works is worse than one that is not offered, because the merchant has
 * to work out afterwards which five did not move.
 *
 * Printing is always available: a slip can be printed for an order in any
 * stage, and reprints are most often wanted for orders already gone.
 */
function paintBulk() {
  const bar = document.querySelector('[data-orders-bulk]');
  if (!bar) return;

  const n = selected.size;
  bar.hidden = n === 0;
  if (!n) return;

  document.querySelector('[data-bulk-count]').textContent =
    `${n} order${n === 1 ? '' : 's'} selected`;

  const picked = rows.filter((o) => selected.has(o.orderNumber));

  // Legal for all of them, and not an ending — endings need a reason each, and
  // one reason typed once for twenty different orders is not a reason.
  const shared = picked.reduce((acc, o) => {
    const allowed = (o.allowedTransitions || []).filter((t) => !NEEDS_REASON.includes(t));
    return acc === null ? allowed : acc.filter((t) => allowed.includes(t));
  }, null) || [];

  // In the drawer the only bulk action that means anything is putting them
  // back — printing a slip for a deleted order, or moving it through a stage,
  // are both offers to work an order that is not on the floor.
  const inTrash = !!document.querySelector('[data-orders-filters]').deleted.value;

  if (inTrash) {
    document.querySelector('[data-bulk-actions]').innerHTML = canDelete('orders')
      ? `<button class="btn-gr btn-primary-gr btn-sm-gr" type="button" data-bulk="restore">
           Restore ${n}
         </button>`
      : '<span class="atable__sub">Only an owner can restore a deleted order.</span>';
    return;
  }

  document.querySelector('[data-bulk-actions]').innerHTML = `
    <button class="btn-gr btn-outline-gr btn-sm-gr" type="button" data-bulk="print">
      Print ${n} slip${n === 1 ? '' : 's'}
    </button>
    ${shared.map((t) => `
      <button class="btn-gr btn-primary-gr btn-sm-gr" type="button" data-bulk="${escapeHtml(t)}">
        ${escapeHtml(TRANSITION_LABELS[t] || t)}
      </button>`).join('')}
    ${
      // Delete is offered whatever stage the selection is in — unlike a move,
      // it does not have to be legal for all of them, because it is the same
      // act on every order regardless of where that order had got to.
      canDelete('orders')
        ? `<button class="btn-gr btn-sm-gr btn-danger-gr" type="button" data-bulk="delete">
             Delete ${n}
           </button>`
        : ''
    }
    ${shared.length ? '' : '<span class="atable__sub">These orders are at different stages — no move applies to all of them.</span>'}`;
}

function clearSelection() {
  selected.clear();
  document.querySelectorAll('[data-pick]').forEach((b) => { b.checked = false; });
  const all = document.querySelector('[data-select-all]');
  if (all) all.checked = false;
  paintBulk();
}

/** One tab, every selected slip, already asking to print. */
function printSlips() {
  const list = [...selected].map(encodeURIComponent).join(',');
  window.open(`/admin/slip?no=${list}&auto=1`, '_blank', 'noopener');
}

/**
 * Move every selected order, and report honestly on what happened.
 *
 * Each order goes through the same single-order endpoint rather than a bulk
 * one, so each gets its own audit row and its own rule check. Settled rather
 * than all-or-nothing on purpose: if one order was changed by somebody else a
 * minute ago, the other nineteen should still move, and the merchant should be
 * told which one did not.
 */
async function bulkMove(to, btn) {
  const list = [...selected];
  btn.disabled = true;
  btn.textContent = `Moving ${list.length}…`;

  const results = await Promise.all(list.map((no) =>
    adminFetch(`/orders/${encodeURIComponent(no)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, note: null }),
    }).then(() => ({ no, ok: true }))
      .catch((err) => ({ no, ok: false, message: err.message }))));

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    alert(
      `${results.length - failed.length} of ${results.length} moved.\n\n`
      + failed.map((f) => `${f.no}: ${f.message}`).join('\n'),
    );
  }

  clearSelection();
  load();
}

/* ---- Deleting ----------------------------------------------------------
   One function for the row and the bulk bar, because they are the same act on
   a list of one or a list of twenty, and two copies would have drifted the
   first time the wording changed. */

/**
 * Delete one order or twenty, after asking once.
 *
 * The dialog names the money, when there is money to name. An order that has
 * been paid has already been posted to the books, and deleting it here does
 * NOT reverse that — the ledger is reversed deliberately, on the Journal
 * screen, or it is not reversed at all. Saying so at the moment of the click
 * is the only place that warning is any use.
 */
async function remove(list, btn) {
  const picked = rows.filter((o) => list.includes(o.orderNumber));
  const paid = picked.filter((o) => o.paymentStatus === 'paid');
  const one = list.length === 1;

  const ok = await confirmDelete({
    title: one
      ? `Delete ${list[0]}?`
      : `Delete ${list.length} orders?`,
    body: paid.length
      ? `${paid.length === 1 ? 'One of these has' : `${paid.length} of these have`} been paid. `
        + 'Deleting does not reverse the sale in the books or put stock back — '
        + 'do those on the Journal and Stock screens if you need them.'
      : 'The order leaves every list and every count. Its items, timeline and refunds stay with it.',
    confirm: one ? 'Delete order' : `Delete ${list.length} orders`,
  });
  if (!ok) return;

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = one ? 'Deleting…' : `Deleting ${list.length}…`;

  /* One request each rather than a bulk endpoint, exactly as bulkMove does and
     for the same reason: each order gets its own note recording who removed
     it, and one order that refuses must not stop the other nineteen. */
  const results = await Promise.all(list.map((no) =>
    adminFetch(`/orders/${encodeURIComponent(no)}`, { method: 'DELETE' })
      .then(() => ({ no, ok: true }))
      .catch((err) => ({ no, ok: false, message: err.message }))));

  report(results, btn, original, 'deleted');
}

/** Put one order back, from its row in the Deleted tab. */
async function putBack(no, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Restoring…';

  try {
    const { message } = await adminFetch(`/orders/${encodeURIComponent(no)}/restore`, { method: 'POST' });
    toast(message || `${no} restored.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    return toast(err.message, false);
  }

  load();
}

/** The same for a selection. No confirm: restoring is not the dangerous one. */
async function putBackMany(list, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = `Restoring ${list.length}…`;

  const results = await Promise.all(list.map((no) =>
    adminFetch(`/orders/${encodeURIComponent(no)}/restore`, { method: 'POST' })
      .then(() => ({ no, ok: true }))
      .catch((err) => ({ no, ok: false, message: err.message }))));

  report(results, btn, original, 'restored');
}

/**
 * Say what happened to all of them, naming the ones that did not.
 *
 * Settled rather than all-or-nothing, so a single refusal — somebody else got
 * there first, a role that is not an owner — leaves the rest done and names
 * the one that is not. A silent partial success is how a merchant ends up
 * believing twenty orders went and finding nineteen.
 */
function report(results, btn, original, verb) {
  const failed = results.filter((r) => !r.ok);

  if (!failed.length) {
    toast(results.length === 1
      ? `${results[0].no} ${verb}.`
      : `${results.length} orders ${verb}.`);
  } else if (failed.length === results.length) {
    btn.disabled = false;
    btn.textContent = original;
    toast(failed[0].message, false);
    return;                       // nothing moved, so nothing to reload for
  } else {
    toast(`${results.length - failed.length} of ${results.length} ${verb}. `
      + failed.map((f) => `${f.no}: ${f.message}`).join(' '), false);
  }

  clearSelection();
  load();
}

/**
 * The one button that moves this order forward, on its own row.
 *
 * WHY ONLY ONE, AND WHY NOT THE ENDINGS
 * -------------------------------------
 * `allowedTransitions` comes from the server in pipeline order, so the first
 * entry that is not an ending IS the next step — Confirm for a placed order,
 * Start packing for a confirmed one. Drawing all of them would put "Cancel
 * order" a few pixels from "Confirm" on every row of a list somebody clicks
 * through at speed.
 *
 * Cancelling, returning and marking spam need a typed reason and stay on the
 * order screen, where there is room to read the order before ending it. The
 * row is for the move you make twenty times a morning; the page is for the
 * move you make once and have to justify.
 */
function rowAction(o) {
  const all = o.allowedTransitions || [];
  const next = all.find((t) => !NEEDS_REASON.includes(t));
  const endings = all.filter((t) => NEEDS_REASON.includes(t));
  const no = escapeHtml(o.orderNumber);

  // A row in the Deleted tab has exactly one thing to offer. Its stage moves
  // are already empty (the server sends none for a deleted order), so this is
  // about not also drawing the Open link as if nothing had happened.
  if (o.deletedAt) {
    return `<div class="arow-actions">${
      canDelete('orders')
        ? `<button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
                   data-arestore-id="${no}">Restore</button>`
        : '<span class="atable__sub">Deleted</span>'
    }</div>`;
  }

  if (!next && !endings.length && !canDelete('orders')) {
    return `<a class="atable__sub" href="/admin/order?no=${encodeURIComponent(o.orderNumber)}">Open</a>`;
  }

  const forward = next
    ? `<button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
               data-move="${escapeHtml(next)}" data-order="${no}">
         ${escapeHtml(TRANSITION_LABELS[next] || next)}
       </button>`
    : '';

  // The endings sit behind a second click on purpose. "Cancel order" a few
  // pixels from "Confirm", on every row of a list somebody works at speed, is
  // a mis-click waiting to happen — and this one texts a customer. Opening the
  // menu is the pause; the reason prompt after it is the confirmation.
  const menu = endings.length || canDelete('orders')
    ? `<details class="amenu">
         <summary aria-label="More actions for order ${no}">⋯</summary>
         <div class="amenu__list">
           ${endings.map((t) => `
             <button type="button" data-move="${escapeHtml(t)}" data-order="${no}">
               ${escapeHtml(TRANSITION_LABELS[t] || t)}
             </button>`).join('')}
           ${
             // Last in the menu, and only for an owner. It shares the endings'
             // second click for the same reason they have one: this is the row
             // of a list somebody works at speed, and the pause is the point.
             canDelete('orders')
               ? `<button type="button" class="amenu__danger" data-adel-id="${no}">Delete order</button>`
               : ''
           }
         </div>
       </details>`
    : '';

  return `<div class="arow-actions">${forward}${menu}</div>`;
}

/**
 * Move one order, from its row.
 *
 * Reloads the list rather than patching the row: the move changes which tab the
 * order belongs to and every count in the bar above it, and re-deriving that in
 * the browser is how the screen starts disagreeing with the database.
 */
async function move(btn) {
  const { move: to, order: no } = btn.dataset;
  const original = btn.textContent;

  // Ending an order takes a reason, here exactly as on the order screen. Six
  // months later "cancelled" on its own answers nothing — whether the customer
  // changed their mind, the stock was gone, or the number was fake is the
  // whole content of the record.
  let note = null;
  if (NEEDS_REASON.includes(to)) {
    note = prompt(
      `${no} — why is this being marked ${stageLabel(to).toLowerCase()}? (recorded against your name)`
    );
    if (note === null) return;             // cancelled the prompt; nothing happens
    if (!note.trim()) return alert(`A reason is required to mark an order ${stageLabel(to).toLowerCase()}.`);
  }

  btn.disabled = true;
  btn.textContent = 'Working…';

  try {
    await adminFetch(`/orders/${encodeURIComponent(no)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, note }),
    });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    // 422 is the useful one: somebody else moved this order first. Saying so on
    // the row beats a silent no-op that leaves two people arguing about it.
    alert(err.message);
    return;
  }

  load();
}

/**
 * `asIs` for text that is already a written phrase — a stage label like "Ready
 * for courier". Raw one-word values (a payment status) keep the stylesheet's
 * capitalisation instead of being title-cased here.
 */
function pill(text, tone, asIs = false) {
  return `<span class="apill${asIs ? ' apill--label' : ''} apill--${tone}">${escapeHtml(text)}</span>`;
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
