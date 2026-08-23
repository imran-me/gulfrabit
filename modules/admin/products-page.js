/**
 * products-page.js — the catalogue list.
 *
 * Leads with the missing-cost count. Without cost there is no margin and no
 * profit figure, and the fastest way to turn that from a vague blocker into
 * work somebody can finish is to put a number on it at the top of the screen.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { canDelete, confirmDelete, toast } from './admin-delete.js';

let page = 1;
let categories = [];

/* The current page's rows, and which of them are ticked.
 *
 * Keyed by SKU, because that is what every product endpoint is bound on and
 * it is stable across a reload in a way a row index is not.
 *
 * Selection is cleared whenever the list reloads, exactly as it is on the
 * orders screen and for the same reason: after a bulk action the rows
 * underneath are no longer the rows that were chosen, and a selection that
 * survives that is a selection that acts on products nobody meant to touch. */
let rows = [];
const selected = new Set();

/** The media module, or null if it is not installed. See categories-page.js. */
let media = null;

document.addEventListener('admin:ready', init);

async function init() {
  const form = document.querySelector('[data-prod-filters]');
  if (!form) return;

  media = await import('/modules/media/media-picker.js').catch(() => null);
  // Awaited, and it must be: restoring ?category= into a <select> that has no
  // options yet silently yields "", and the first load()'s replaceState then
  // deletes the parameter from the URL — a refreshed or shared filter link
  // came back unfiltered. setupCreate() is what fills the options.
  await setupCreate();

  paintTabs({});   // drawn immediately, the count filled in when it arrives

  const params = new URLSearchParams(location.search);
  ['q', 'noCost', 'category', 'sort', 'deleted'].forEach((k) => {
    if (params.has(k) && form[k]) form[k].value = params.get(k);
  });
  page = Math.max(1, Number(params.get('page')) || 1);

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });

  document.querySelector('[data-prod-body]')?.addEventListener('change', (e) => {
    const box = e.target.closest('[data-pick]');
    if (!box) return;

    if (box.checked) selected.add(box.dataset.pick);
    else selected.delete(box.dataset.pick);

    paintBulk();
  });

  // "Every product on this page", not every product matching the filters.
  // Ticking a box must never quietly select two thousand rows the merchant
  // cannot see; the count in the bar is then a number they can check.
  document.querySelector('[data-select-all]')?.addEventListener('change', (e) => {
    rows.forEach((r) => (e.target.checked ? selected.add(r.sku) : selected.delete(r.sku)));
    document.querySelectorAll('[data-pick]').forEach((b) => { b.checked = e.target.checked; });
    paintBulk();
  });

  document.querySelector('[data-bulk-clear]')?.addEventListener('click', clearSelection);

  document.querySelector('[data-bulk-actions]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bulk]');
    if (!btn) return;

    const list = [...selected];

    if (btn.dataset.bulk === 'delete') return removeMany(list, btn);
    if (btn.dataset.bulk === 'restore') return putBackMany(list, btn);
    if (btn.dataset.bulk === 'purge') return purge(list, btn);

    setListed(list, btn.dataset.bulk === 'list', btn);
  });
  document.querySelector('[data-prod-clear]')?.addEventListener('click', () => {
    form.reset();
    // reset() restores a hidden input's default attribute rather than clearing
    // it; that default is empty, so Clear does leave the Deleted tab.
    form.deleted.value = '';
    page = 1;
    load();
  });

  document.querySelector('[data-prod-tabs]')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-prod-tab]');
    if (!tab) return;
    form.deleted.value = tab.dataset.prodTab;
    page = 1;
    load();
  });
  document.querySelector('[data-cost-gap-filter]')?.addEventListener('click', () => {
    form.noCost.value = '1';
    page = 1;
    load();
  });
  document.querySelector('[data-ppage-prev]')?.addEventListener('click', () => { page--; load(); });
  document.querySelector('[data-ppage-next]')?.addEventListener('click', () => { page++; load(); });

  load();
}

/* ------------------------------------------------------------------ *
 * Creating a product
 * ------------------------------------------------------------------ */

async function setupCreate() {
  const form = document.querySelector('[data-prod-form]');
  if (!form) return;

  document.querySelector('[data-prod-new]')?.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) {
      form.title.focus();
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  document.querySelector('[data-prod-cancel]')?.addEventListener('click', () => {
    form.hidden = true;
    form.reset();
  });

  form.addEventListener('submit', create);

  if (media) {
    media.mountGalleryFields(form);
  } else {
    // The API requires at least one photo, so without the media module there
    // is no way to complete this form. Better to say that than to let someone
    // fill it in and be refused on submit.
    const photos = form.querySelector('[data-prod-photos]');
    if (photos) {
      photos.innerHTML = '<p class="admin__sub" style="margin:0">'
        + 'Photos need the media module, which is not installed.</p>';
    }
    form.querySelector('button[type="submit"]').disabled = true;
  }

  try {
    ({ data: categories } = await adminFetch('/categories'));
  } catch {
    return;      // the selects stay empty; the list below still works
  }

  const cats = form.querySelector('[data-prod-cats]');
  const tops = categories.filter((c) => !c.parent);

  // Switched-off categories are offered, and labelled. Building a product into
  // a category you have not launched yet is a normal thing to do — it is the
  // reason new products are created unlisted.
  cats.innerHTML = tops.map((c) =>
    `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}${
      c.isActive ? '' : ' (switched off)'}</option>`).join('');

  cats.addEventListener('change', () => fillSubs(form));
  fillSubs(form);

  // The filter select shares the fetch. Options only — init() restores the
  // URL state itself after this function resolves, which is why it awaits us.
  const filter = document.querySelector('[data-pf-category]');
  if (filter) {
    filter.innerHTML = '<option value="">All categories</option>' + tops.map((c) =>
      `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}${
        c.isActive ? '' : ' (switched off)'}</option>`).join('');
  }
}

function fillSubs(form) {
  const wrap = form.querySelector('[data-prod-subwrap]');
  const subs = form.querySelector('[data-prod-subs]');
  const kids = categories.filter((c) => c.parent === form.category.value);

  wrap.hidden = kids.length === 0;
  subs.innerHTML = '<option value="">None</option>' + kids.map((c) =>
    `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
}

async function create(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');

  const images = form.images ? JSON.parse(form.images.value || '[]') : [];

  if (!images.length) {
    return problem('Add at least one photo — it becomes the product\'s main image.');
  }

  btn.disabled = true;

  const was = form.originalPriceTaka.value.trim();

  let result;
  try {
    result = await adminFetch('/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.value.trim(),
        category: form.category.value,
        subCategory: form.subCategory && !form.querySelector('[data-prod-subwrap]').hidden
          ? form.subCategory.value || null
          : null,
        priceTaka: Number(form.priceTaka.value),
        originalPriceTaka: was === '' ? null : Number(was),
        images,
      }),
    });
  } catch (err) {
    btn.disabled = false;
    return problem(err.message);
  }

  // Straight to the edit screen. The create form asked for four fields; brand,
  // origin, barcode, cost and the description are the rest of the job, and
  // dropping the merchant back onto a list means most of them never get filled.
  location.assign(`/modules/admin/product-edit.html?sku=${encodeURIComponent(result.data.id)}`);
}

function problem(message) {
  const el = document.querySelector('[data-prod-error]');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ------------------------------------------------------------------ */

async function load() {
  const body = document.querySelector('[data-prod-body]');
  const form = document.querySelector('[data-prod-filters]');

  const qs = new URLSearchParams();
  ['q', 'noCost', 'category', 'sort', 'deleted'].forEach((k) => {
    const v = form[k]?.value.trim();
    if (v) qs.set(k, v);
  });
  if (page > 1) qs.set('page', String(page));
  history.replaceState(null, '', qs.toString() ? `?${qs}` : location.pathname);

  body.innerHTML = '<tr><td colspan="8" class="atable__empty">Loading…</td></tr>';

  let payload;
  try {
    payload = await adminFetch(`/products?${qs}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="8" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — products appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    document.querySelector('[data-prod-count]').textContent = '';
    return;
  }

  paint(payload);
}

/**
 * The catalogue, and what has been taken out of it.
 *
 * destroy() has soft-deleted since this screen was written and restore() has
 * existed just as long — but nothing in the panel could see a deleted product,
 * so "it can be restored" was a promise with no screen behind it. This is that
 * screen.
 */
function paintTabs(meta) {
  const host = document.querySelector('[data-prod-tabs]');
  if (!host) return;

  const inTrash = !!document.querySelector('[data-prod-filters]')?.deleted.value;
  const badge = (n) => (n === undefined ? '' : `<span class="atab__count">${n.toLocaleString('en-BD')}</span>`);

  host.innerHTML = `
    <button class="atab${inTrash ? '' : ' is-on'}" type="button" data-prod-tab=""
            aria-current="${inTrash ? 'false' : 'page'}">
      Catalogue${badge(inTrash ? undefined : meta.total)}
    </button>
    <button class="atab atab--trash${inTrash ? ' is-on' : ''}" type="button" data-prod-tab="1"
            aria-current="${inTrash ? 'page' : 'false'}">
      Deleted${badge(meta.deletedCount)}
    </button>`;
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-prod-body]');
  const inTrash = !!document.querySelector('[data-prod-filters]').deleted.value;

  // Held so the bulk bar can decide what is offered without asking the server
  // again, and so select-all knows what "this page" contains.
  rows = data;

  paintTabs(meta);

  document.querySelector('[data-prod-count]').textContent = inTrash
    ? `${meta.total.toLocaleString('en-BD')} deleted product${meta.total === 1 ? '' : 's'}`
    : `${meta.total.toLocaleString('en-BD')} product${meta.total === 1 ? '' : 's'}`;

  // The missing-cost worklist is about products that are for sale. Leading the
  // Deleted tab with "14 products have no cost" would be counting work that
  // does not need doing.
  const gap = document.querySelector('[data-cost-gap]');
  if (meta.missingCost > 0 && !inTrash) {
    gap.hidden = false;
    document.querySelector('[data-cost-gap-n]').textContent = meta.missingCost;
  } else {
    gap.hidden = true;
  }

  if (!data.length) {
    body.innerHTML = `<tr><td colspan="8" class="atable__empty">${
      inTrash
        ? 'Nothing has been deleted. Products you remove land here, and can be put back.'
        : 'Nothing matches these filters.'
    }</td></tr>`;
    document.querySelector('[data-prod-pager]').hidden = true;
    return;
  }

  body.innerHTML = data.map((p, i) => `
    <tr class="${p.deletedAt ? 'is-deleted' : ''}">
      <td class="atable__pick">
        <input type="checkbox" data-pick="${escapeHtml(p.sku)}"
               ${selected.has(p.sku) ? 'checked' : ''}
               aria-label="Select ${escapeHtml(p.title)}">
      </td>
      <td class="atable__name">
        <a href="/admin/products/edit?sku=${encodeURIComponent(p.sku)}">${escapeHtml(p.title)}</a>
        <div class="atable__sub">${escapeHtml(p.sku)}${p.brand ? ` · ${escapeHtml(p.brand)}` : ''}</div>
      </td>
      <td class="atable__sub">${escapeHtml(p.category || '—')}${placement(p)}</td>
      <td class="atable__num">৳ ${Number(p.priceTaka).toLocaleString('en-BD')}</td>
      <td class="atable__num">${
        // "Not recorded" rather than a dash or a zero. The distinction is the
        // whole reason the column is nullable.
        p.costTaka == null
          ? '<span class="atable__sub">not recorded</span>'
          : `৳ ${Number(p.costTaka).toLocaleString('en-BD')}`
      }</td>
      <td class="atable__num">${p.marginPct == null ? '<span class="atable__sub">—</span>' : `${p.marginPct}%`}</td>
      <td>${status(p)}</td>
      <td class="atable__actions">${
        p.deletedAt
          // Editing a deleted product is not offered: the edit screen saves to
          // a catalogue this product is not in, so every field on it would be
          // a change nobody can see. Put it back first, then edit it.
          ? (canDelete()
              ? `<button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
                         data-prod-restore="${i}">Restore</button>
                 <button class="btn-gr btn-ghost-gr btn-sm-gr aact-remove" type="button"
                         data-prod-purge="${i}">Delete for ever</button>`
              : '<span class="atable__sub">Deleted</span>')
          : `<a class="btn-gr btn-ghost-gr btn-sm-gr" href="/admin/products/edit?sku=${encodeURIComponent(p.sku)}">Edit</a>
             ${canDelete()
               ? `<button class="btn-gr btn-ghost-gr btn-sm-gr aact-remove" type="button"
                          data-prod-remove="${i}">Remove</button>`
               : ''}`
      }</td>
    </tr>`).join('');

  // The button carries only the row INDEX; sku and title are read back from
  // the data array. escapeHtml() is the textContent trick, which does not
  // escape double quotes — safe between tags, not inside an attribute — so a
  // title like Dates "Royal" interpolated into data-prod-title would break
  // out of it. An integer cannot.
  body.querySelectorAll('[data-prod-remove]').forEach((btn) =>
    btn.addEventListener('click', () => remove(btn, data[Number(btn.dataset.prodRemove)])));

  // Same index trick as above, and for the same reason — see the note there.
  body.querySelectorAll('[data-prod-restore]').forEach((btn) =>
    btn.addEventListener('click', () => putBack(btn, data[Number(btn.dataset.prodRestore)])));

  body.querySelectorAll('[data-prod-purge]').forEach((btn) =>
    btn.addEventListener('click', () => purge([data[Number(btn.dataset.prodPurge)].sku], btn)));

  // Every reload replaces the rows, so nothing stays ticked — see the note by
  // `selected`. Called after the body is painted so the header box clears too.
  clearSelection();

  const pager = document.querySelector('[data-prod-pager]');
  pager.hidden = meta.lastPage <= 1;
  document.querySelector('[data-ppage-label]').textContent = `Page ${meta.currentPage} of ${meta.lastPage}`;
  document.querySelector('[data-ppage-prev]').disabled = meta.currentPage <= 1;
  document.querySelector('[data-ppage-next]').disabled = meta.currentPage >= meta.lastPage;
}

/**
 * Where this product is promoted, as small chips under the category name.
 * Same vocabulary the Placement card on the edit page writes; anything beyond
 * the four known tags is a merchant's own label and not a placement, so it is
 * not shown here.
 */
function placement(p) {
  const NAMES = { featured: 'Featured', premium: 'Premium', bestseller: 'Best seller', new: 'New' };
  const chips = (p.tags ?? []).filter((t) => NAMES[t]).map((t) =>
    `<span class="achip">${NAMES[t]}</span>`);
  return chips.length ? `<div class="achips">${chips.join('')}</div>` : '';
}

/* ------------------------------------------------------------------ *
 * Working the whole selection
 *
 * ARCHIVE IS CALLED UNLIST, because the catalogue already has that state and
 * it already has that name. A product with is_active false is off the shop
 * and still in the catalogue — its price history, its stock ledger and its
 * place in past orders all intact — which is exactly what "archive" is asked
 * for. Adding a third word for it would give the panel two names for one
 * state, and the screens that say "Unlisted" today would start disagreeing
 * with the button that produced it.
 *
 * So there are three things you can do to a selection, and they are the three
 * states a product can be in:
 *
 *   List     on the shop
 *   Unlist   in the catalogue, off the shop        <- the archive
 *   Delete   in the Deleted tab, restorable        <- the bin
 *
 * Each is one request per product rather than a bulk endpoint, exactly as the
 * orders screen does and for the same reason: one product that refuses — a
 * validation rule, a race with somebody else's edit — must not stop the other
 * nineteen, and the report below can then name the ones that did not go.
 * ------------------------------------------------------------------ */

function clearSelection() {
  selected.clear();

  document.querySelectorAll('[data-pick]').forEach((b) => { b.checked = false; });

  const all = document.querySelector('[data-select-all]');
  if (all) all.checked = false;

  paintBulk();
}

/**
 * What can be done to everything currently ticked.
 *
 * The Deleted tab offers only Restore: listing something that is not in the
 * catalogue is not a state, and the server would refuse it.
 *
 * Delete and Restore are drawn only for an owner, because that is what the
 * route enforces — see RequireOwner. Unlist and List are not gated: curating
 * the catalogue is the job of anyone who may reach this screen at all, and
 * neither one destroys anything.
 */
function paintBulk() {
  const bar = document.querySelector('[data-prod-bulk]');
  if (!bar) return;

  const n = selected.size;
  bar.hidden = n === 0;

  if (!n) return;

  bar.querySelector('[data-bulk-count]').textContent =
    `${n} product${n === 1 ? '' : 's'} selected`;

  const inTrash = !!document.querySelector('[data-prod-filters]').deleted.value;

  const actions = inTrash
    ? (canDelete()
        ? [['restore', 'Restore', 'btn-outline-gr'],
           ['purge', 'Delete for ever', 'btn-ghost-gr aact-remove']]
        : [])
    : [
        ['unlist', 'Unlist', 'btn-outline-gr'],
        ['list', 'Put on the shop', 'btn-ghost-gr'],
        ...(canDelete() ? [['delete', 'Delete', 'btn-ghost-gr aact-remove']] : []),
      ];

  bar.querySelector('[data-bulk-actions]').innerHTML = actions.length
    ? actions.map(([key, label, cls]) =>
        `<button class="btn-gr ${cls} btn-sm-gr" type="button" data-bulk="${key}">${label}</button>`).join('')
    : '<span class="atable__sub">Only an owner can restore a deleted product.</span>';
}

/**
 * List or unlist a selection.
 *
 * Unlisting is the archive, and it deliberately does NOT ask first. It takes
 * products off the shop and changes nothing else, the button that undoes it is
 * sitting next to it, and a confirmation on a reversible bulk action is how
 * people learn to click through the one that matters.
 */
async function setListed(list, active, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = active ? `Listing ${list.length}…` : `Unlisting ${list.length}…`;

  const results = await Promise.all(list.map((sku) =>
    adminFetch(`/products/${encodeURIComponent(sku)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: active }),
    })
      .then(() => ({ sku, ok: true }))
      .catch((err) => ({ sku, ok: false, message: err.message }))));

  report(results, btn, original, active ? 'put on the shop' : 'unlisted');
}

/** Delete a selection. This one asks — it is the only one that is not a toggle. */
async function removeMany(list, btn) {
  const one = list.length === 1;
  const picked = rows.filter((r) => list.includes(r.sku));
  const live = picked.filter((r) => r.isActive).length;

  const ok = await confirmDelete({
    title: one
      ? `Remove "${picked[0]?.title ?? list[0]}" from the shop?`
      : `Delete ${list.length} products?`,
    // Naming how many are currently ON THE SHOP is the number that matters:
    // deleting an unlisted product changes nothing a customer can see, and
    // deleting fourteen live ones empties fourteen pages.
    body: live
      ? `${live === 1 ? 'One of these is' : `${live} of these are`} on the shop right now and `
        + 'will disappear from it, and from search. Orders that already contain them are not affected.'
      : 'None of these are on the shop, so nothing a customer can see changes. '
        + 'Orders that already contain them are not affected.',
    confirm: one ? 'Delete product' : `Delete ${list.length} products`,
  });
  if (!ok) return;

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = `Deleting ${list.length}…`;

  const results = await Promise.all(list.map((sku) =>
    adminFetch(`/products/${encodeURIComponent(sku)}`, { method: 'DELETE' })
      .then(() => ({ sku, ok: true }))
      .catch((err) => ({ sku, ok: false, message: err.message }))));

  report(results, btn, original, 'deleted', true);
}

/** Put a selection back. No confirm: restoring is not the dangerous direction. */
async function putBackMany(list, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = `Restoring ${list.length}…`;

  const results = await Promise.all(list.map((sku) =>
    adminFetch(`/products/${encodeURIComponent(sku)}/restore`, { method: 'POST' })
      .then(() => ({ sku, ok: true }))
      .catch((err) => ({ sku, ok: false, message: err.message }))));

  report(results, btn, original, 'restored, still unlisted', true);
}

/* ------------------------------------------------------------------ *
 * Emptying the bin
 *
 * The one thing on this screen that is not reversible, and it is built to
 * feel like it.
 *
 * IT DELIBERATELY DOES NOT USE confirmDelete(). That helper's promise — "it
 * moves to the Deleted tab, where you can put it back" — is true of every
 * other delete in the panel, which is exactly why people click through it
 * without reading. Borrowing the same dialog for the one action where the
 * promise is false would spend the reflex it built on the worst possible
 * case. See the note at the top of admin-delete.js.
 *
 * THE SERVER WRITES THE WARNING, not this file. A purge erases the stock
 * ledger and the price history for that product, and how much of either
 * exists is a fact only the database knows. So the first request is sent
 * WITHOUT confirm, comes back 409 carrying the counts, and the dialog states
 * them: "41 stock movements and 6 price changes will be erased" is something
 * a merchant can weigh. "This cannot be undone" is true of half this screen
 * and has stopped meaning anything.
 * ------------------------------------------------------------------ */

async function purge(list, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking…';

  // The dry run. Every one of these is expected to fail with 409 — that IS
  // the answer — so a 2xx here would mean the server purged without being
  // asked to, and is worth treating as the anomaly it would be.
  const checks = await Promise.all(list.map((sku) =>
    adminFetch(`/products/${encodeURIComponent(sku)}/permanent`, { method: 'DELETE' })
      .then(() => ({ sku, blocked: false, counts: null, message: '' }))
      .catch((err) => ({
        sku,
        blocked: !!err.body?.blocked,
        counts: err.body?.counts ?? null,
        message: err.message,
      }))));

  const blocked = checks.filter((c) => c.blocked);

  // Counts are the whole point of the dry run, so anything that came back
  // without them does not go in the dialog. That covers the stale-page case —
  // a row purged from another tab is already gone and answers 404 — and the
  // anomaly where a 2xx means the server purged without being asked.
  const canGo = checks.filter((c) => !c.blocked && c.counts);
  const unclear = checks.filter((c) => !c.blocked && !c.counts);

  btn.disabled = false;
  btn.textContent = original;

  if (unclear.length) {
    toast(`${unclear.map((u) => u.sku).join(', ')}: ${unclear[0].message}`, false);
  }

  if (!canGo.length) {
    // Everything chosen is refused outright — a gift reward, most likely.
    // Nothing to confirm, so nothing is asked.
    if (blocked.length) toast(blocked[0].message, false);
    return unclear.length ? load() : undefined;
  }

  const ok = await confirmForever(canGo, blocked);
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = `Deleting ${canGo.length}…`;

  const results = await Promise.all(canGo.map(({ sku }) =>
    adminFetch(`/products/${encodeURIComponent(sku)}/permanent?confirm=1`, { method: 'DELETE' })
      .then(() => ({ sku, ok: true }))
      .catch((err) => ({ sku, ok: false, message: err.message }))));

  report(results, btn, original, 'deleted for good', true);
}

/**
 * The last question, asked in its own words.
 *
 * Built here rather than in admin-delete.js because it is the only permanent
 * delete in the panel today. The moment a second screen needs one, this moves
 * there — the same rule the stylesheets follow about promoting on repeat.
 *
 * @param {Array<{sku:string,counts:object|null,message:string}>} going
 * @param {Array<{sku:string,message:string}>} blocked
 * @returns {Promise<boolean>}
 */
function confirmForever(going, blocked) {
  const total = going.reduce((sum, g) => ({
    stockMovements: sum.stockMovements + (g.counts?.stockMovements ?? 0),
    priceChanges: sum.priceChanges + (g.counts?.priceChanges ?? 0),
    orderLines: sum.orderLines + (g.counts?.orderLines ?? 0),
  }), { stockMovements: 0, priceChanges: 0, orderLines: 0 });

  const one = going.length === 1;

  // For a single product the server already wrote the sentence, with its name
  // in it. For several, the totals are summed here — one dialog with a real
  // number beats twelve dialogs nobody reads to the end.
  const body = one
    ? going[0].message
    : [
        `${going.length} products will be erased, along with `,
        total.stockMovements || total.priceChanges
          ? `${total.stockMovements} stock movement${total.stockMovements === 1 ? '' : 's'} `
            + `and ${total.priceChanges} price change${total.priceChanges === 1 ? '' : 's'}.`
          : 'no stock or price history.',
        total.orderLines
          ? ` The ${total.orderLines} past order line${total.orderLines === 1 ? '' : 's'} `
            + 'containing them keep their own copy of the name and price, so those orders still read correctly.'
          : ' None of them have ever been ordered.',
      ].join('');

  const dlg = document.querySelector('[data-pforever]') ?? (() => {
    document.body.insertAdjacentHTML('beforeend', [
      '<dialog class="adel adel--forever" data-pforever>',
      '  <form method="dialog" class="adel__panel">',
      '    <h2 class="adel__title" data-pf-title></h2>',
      '    <p class="adel__body" data-pf-body></p>',
      '    <p class="adel__undo" data-pf-blocked hidden></p>',
      '    <p class="adel__body"><strong>There is no bin after this one.</strong></p>',
      '    <div class="adel__actions">',
      '      <button type="submit" value="cancel" class="btn-gr btn-outline-gr" data-pf-cancel>Keep them</button>',
      '      <button type="submit" value="confirm" class="btn-gr btn-danger-gr" data-pf-confirm></button>',
      '    </div>',
      '  </form>',
      '</dialog>',
    ].join('\n'));

    return document.querySelector('[data-pforever]');
  })();

  dlg.querySelector('[data-pf-title]').textContent = one
    ? 'Delete this product for ever?'
    : `Delete ${going.length} products for ever?`;

  dlg.querySelector('[data-pf-body]').textContent = body;

  // Named, not counted. "One was skipped" sends the merchant looking; the SKU
  // is the thing they can search for on the screen they are already on.
  const blockedEl = dlg.querySelector('[data-pf-blocked]');
  blockedEl.hidden = !blocked.length;
  blockedEl.textContent = blocked.length
    ? `${blocked.map((b) => b.sku).join(', ')} cannot be deleted for good and will be left in the bin. `
      + blocked[0].message
    : '';

  dlg.querySelector('[data-pf-confirm]').textContent = one
    ? 'Delete for ever'
    : `Delete ${going.length} for ever`;

  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'confirm'), { once: true });
    dlg.showModal();
    // Cancel holds focus, for the same reason it does in admin-delete.js: the
    // default answer to this question is no.
    dlg.querySelector('[data-pf-cancel]').focus();
  });
}

/**
 * Say what happened, including the half that did not.
 *
 * A partial failure is the case worth designing for: nineteen went and one did
 * not, and a bare "done" would leave the merchant believing all twenty had.
 * The failures are named by SKU, because that is the thing they can search
 * for on the screen they are already looking at.
 */
function report(results, btn, original, verb, removesRows = false) {
  const failed = results.filter((r) => !r.ok);

  if (!failed.length) {
    toast(results.length === 1
      ? `1 product ${verb}.`
      : `${results.length} products ${verb}.`);
  } else if (failed.length === results.length) {
    btn.disabled = false;
    btn.textContent = original;
    return toast(failed[0].message, false);   // nothing changed, nothing to reload for
  } else {
    toast(`${results.length - failed.length} of ${results.length} ${verb}. `
      + failed.map((f) => `${f.sku}: ${f.message}`).join(' '), false);
  }

  // Only when the rows actually LEFT this list. Deleting the whole of page
  // three empties it, and reloading a page past the end shows "nothing
  // matches" with no pager to get back — so step back first. Unlisting is not
  // that: the products stay on the Catalogue tab, wearing a different pill,
  // and stepping back would jump the merchant away from the work they just did.
  if (removesRows && page > 1 && failed.length < results.length
      && results.length - failed.length >= rows.length) {
    page -= 1;
  }

  load();
}

/**
 * Remove from the shop, from the list. Same endpoint and same promise as the
 * edit page's button: soft delete, past orders untouched, restorable.
 */
async function remove(btn, row) {
  if (!row) return;
  const skuVal = row.sku;
  const title = row.title;

  const ok = await confirmDelete({
    title: `Remove "${title}" from the shop?`,
    body: 'It disappears from the site and from search. Orders that already contain it are not affected.',
  });
  if (!ok) return;

  btn.disabled = true;

  try {
    const { message } = await adminFetch(`/products/${encodeURIComponent(skuVal)}`, { method: 'DELETE' });
    toast(message || `${title} removed from the shop.`);
  } catch (err) {
    btn.disabled = false;
    return problem(err.message);
  }

  // If that was the only row on this page, the page number now points past
  // the end: the server would answer with zero rows, paint() would say
  // "Nothing matches these filters" and hide the pager — no way back except
  // re-submitting the filters. Step back before reloading instead.
  if (page > 1 && document.querySelectorAll('[data-prod-remove]').length === 1) {
    page -= 1;
  }

  load();   // the row is gone from server truth; repaint from it
}

/**
 * Put a deleted product back in the catalogue — still unlisted.
 *
 * destroy() sets is_active false on the way out precisely so this cannot
 * republish a product to the shop by surprise; restoring returns it to the
 * catalogue where its price history and stock ledger are waiting, and listing
 * it again stays a separate, deliberate act on the edit screen.
 *
 * No confirm dialog. Restoring is the safe direction, and asking "are you
 * sure?" about undoing something is how people learn to click through the
 * question that matters.
 */
async function putBack(btn, row) {
  if (!row) return;

  btn.disabled = true;
  btn.textContent = 'Restoring…';

  try {
    const { message } = await adminFetch(
      `/products/${encodeURIComponent(row.sku)}/restore`, { method: 'POST' });
    toast(message || `${row.title} is back in the catalogue.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Restore';
    return toast(err.message, false);
  }

  // Same step-back as remove(): if that was the last row in the Deleted tab,
  // the page number now points past the end and the screen would come back
  // empty with no pager to get out of.
  if (page > 1 && document.querySelectorAll('[data-prod-restore]').length === 1) {
    page -= 1;
  }

  load();
}

function status(p) {
  if (!p.isActive) return '<span class="apill apill--wait">Unlisted</span>';
  return p.inStock
    ? '<span class="apill apill--ok">In stock</span>'
    : '<span class="apill apill--bad">Out of stock</span>';
}
