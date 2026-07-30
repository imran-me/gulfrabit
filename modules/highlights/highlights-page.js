/**
 * highlights-page.js — curating the home page shelves.
 *
 * Each shelf is edited in place and saved with its own button. There is no
 * single Save for the page: a merchant who reorders "Premium picks", then gets
 * distracted, should not lose it because they never scrolled to the bottom —
 * and should not accidentally publish a half-finished second shelf either.
 *
 * Reordering is arrows and a star, matching the product gallery. Same reason:
 * dragging on a touch screen fights the page scroll, and this panel is mostly
 * used on a phone.
 */

import { adminFetch } from '/modules/admin/backend/api.js';
import { escapeHtml } from '/modules/admin/admin-shell.js';

let rails = [];
let catalogue = [];       // every product, for the picker
let dirty = new Set();    // rail keys with unsaved changes

document.addEventListener('admin:ready', init);

async function init() {
  if (!document.querySelector('[data-hl-rails]')) return;

  // Warn before losing work. The browser only honours this after the user has
  // interacted with the page, which is exactly when there is something to lose.
  window.addEventListener('beforeunload', (e) => {
    if (dirty.size) e.preventDefault();
  });

  await load();
}

async function load() {
  const host = document.querySelector('[data-hl-rails]');

  try {
    ({ data: rails } = await adminFetch('/highlights'));
  } catch (err) {
    host.innerHTML = `<p class="admin__sub">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — shelves appear once the API is live.'
        : escapeHtml(err.message)
    }</p>`;
    return;
  }

  try {
    ({ data: catalogue } = await adminFetch('/products?perPage=100'));
  } catch {
    catalogue = [];
  }

  dirty.clear();
  paint();
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function paint() {
  const curated = rails.filter((r) => r.items.length).length;

  document.querySelector('[data-hl-count]').textContent =
    `${rails.length} shelves · ${curated} curated, ${rails.length - curated} running on tags`;

  document.querySelector('[data-hl-rails]').innerHTML = rails.map(shelf).join('');
  wire();
}

function shelf(rail) {
  const chosen = new Set(rail.items.map((i) => i.sku));

  const available = catalogue.filter((p) => !chosen.has(p.id));

  return `
    <section class="acard hlrail" data-hl-rail="${escapeHtml(rail.rail)}"
             style="margin-bottom:var(--space-5)">
      <div class="acat__head" style="margin-bottom:var(--space-3)">
        <div class="acat__ident">
          <h2 class="h5" style="margin:0">${escapeHtml(rail.label)}</h2>
          <span class="atable__sub">${escapeHtml(rail.blurb)}</span>
        </div>
        <span class="apill ${rail.items.length ? 'apill--ok' : 'apill--wait'}">
          ${rail.items.length ? `${rail.items.length} chosen` : `tag: ${escapeHtml(rail.fallbackTag)}`}
        </span>
      </div>

      ${rail.items.length
        ? `<ol class="hllist" data-hl-list>${rail.items.map(row).join('')}</ol>`
        : `<p class="admin__sub" data-hl-list>
             Nothing chosen. The site is showing products tagged
             <code>${escapeHtml(rail.fallbackTag)}</code> until you pick some.
           </p>`}

      <div class="hlrail__foot">
        <select class="input-gr hlrail__add" data-hl-add>
          <option value="">Add a product…</option>
          ${available.map((p) =>
            `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}${
              p.isActive ? '' : ' (unlisted)'}</option>`).join('')}
        </select>
        <button type="button" class="btn-gr btn-primary-gr btn-sm-gr" data-hl-save disabled>
          Save this shelf
        </button>
        <span class="atable__sub" data-hl-state></span>
      </div>
    </section>`;
}

function row(item, i, all) {
  return `
    <li class="hlitem${item.hidden ? ' is-hidden' : ''}" data-sku="${escapeHtml(item.sku)}">
      <span class="hlitem__n">${i + 1}</span>
      <div class="hlitem__pic">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : ''}
      </div>
      <div class="hlitem__body">
        <strong>${escapeHtml(item.title)}</strong>
        <span class="atable__sub">৳${Number(item.price).toLocaleString('en-BD')}</span>
        ${item.hidden
          ? `<span class="apill apill--bad">not on the site — ${escapeHtml(item.hidden)}</span>`
          : ''}
      </div>
      <div class="hlitem__acts">
        <button type="button" data-move="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&#8593;</button>
        <button type="button" data-move="down" ${i === all.length - 1 ? 'disabled' : ''} aria-label="Move down">&#8595;</button>
        <button type="button" data-move="off" class="is-danger" aria-label="Remove from shelf">&times;</button>
      </div>
    </li>`;
}

/* ------------------------------------------------------------------ *
 * Interaction
 * ------------------------------------------------------------------ */

function wire() {
  document.querySelectorAll('[data-hl-rail]').forEach((section) => {
    const key = section.dataset.hlRail;
    const rail = rails.find((r) => r.rail === key);

    section.querySelectorAll('[data-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sku = btn.closest('[data-sku]').dataset.sku;
        const i = rail.items.findIndex((it) => it.sku === sku);

        if (btn.dataset.move === 'up' && i > 0) swap(rail.items, i, i - 1);
        if (btn.dataset.move === 'down' && i < rail.items.length - 1) swap(rail.items, i, i + 1);
        if (btn.dataset.move === 'off') rail.items.splice(i, 1);

        touch(key);
      });
    });

    section.querySelector('[data-hl-add]')?.addEventListener('change', (e) => {
      const sku = e.target.value;
      if (!sku) return;

      const product = catalogue.find((p) => p.id === sku);
      if (!product) return;

      rail.items.push({
        sku: product.id,
        title: product.title,
        image: product.image,
        price: product.price,
        // The server recomputes this on reload; the optimistic value only has
        // to be right about the product's own switch, which is what the
        // catalogue list already told us.
        hidden: product.isActive ? null : 'unlisted',
      });

      touch(key);
    });

    section.querySelector('[data-hl-save]')?.addEventListener('click', () => save(key));
  });
}

/** Redraw after a local edit, and remember the shelf needs saving. */
function touch(key) {
  dirty.add(key);
  paint();

  const section = document.querySelector(`[data-hl-rail="${CSS.escape(key)}"]`);
  section.querySelector('[data-hl-save]').disabled = false;
  section.querySelector('[data-hl-state]').textContent = 'not saved yet';
  section.classList.add('is-dirty');
}

function swap(arr, a, b) {
  [arr[a], arr[b]] = [arr[b], arr[a]];
}

async function save(key) {
  const rail = rails.find((r) => r.rail === key);
  const section = document.querySelector(`[data-hl-rail="${CSS.escape(key)}"]`);
  const btn = section.querySelector('[data-hl-save]');
  const state = section.querySelector('[data-hl-state]');

  btn.disabled = true;
  state.textContent = 'saving…';

  let result;
  try {
    result = await adminFetch(`/highlights/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus: rail.items.map((i) => i.sku) }),
    });
  } catch (err) {
    btn.disabled = false;
    state.textContent = '';
    return note(err.message, false);
  }

  dirty.delete(key);
  section.classList.remove('is-dirty');
  state.textContent = 'saved';
  note(`${rail.label}: ${result.message}`, true);

  // Reload only this shelf's truth from the server — the "not on the site"
  // reasons are computed there and a local guess would go stale.
  setTimeout(() => { if (!dirty.size) load(); }, 600);
}

function note(message, ok) {
  const el = document.querySelector('[data-hl-note]');
  el.textContent = message;
  el.hidden = false;
  el.style.background = ok ? 'rgba(46,160,67,.10)' : '';
  el.style.color = ok ? '#1a7f37' : '';
}
