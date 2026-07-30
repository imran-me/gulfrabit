/**
 * media-picker.js — choose or upload an image, from anywhere in the panel.
 *
 * TWO WAYS TO USE IT
 * ------------------
 * 1. Declarative, which is what most screens want. Put this in the markup:
 *
 *      <div data-media-field="image" data-value="/uploads/…" data-label="Icon"></div>
 *
 *    and call mountImageFields(root). It renders a preview plus a button, and
 *    keeps a hidden <input name="image"> in step, so a normal form submit or a
 *    normal `form.image.value` read just works. No screen needs to know the
 *    picker exists beyond that one attribute.
 *
 * 2. Imperative, for flows that are not a form field:
 *
 *      const asset = await pickImage();   // null if dismissed
 *
 * WHY A SHEET AND NOT A PAGE
 * --------------------------
 * Choosing an image always happens in the middle of doing something else —
 * naming a category, editing a product. Navigating away means losing the form,
 * or building draft persistence to avoid losing it. A sheet keeps the work
 * underneath alive, which is also why dismissing it resolves to null rather
 * than throwing: cancelling is a normal outcome, not an error.
 *
 * On a phone it is a full-height sheet that rises from the bottom, because the
 * thumb is at the bottom and a centred dialog puts every control out of reach.
 */

import { adminFetch, csrfHeader } from '/modules/admin/backend/api.js';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

let sheet = null;
let resolveOpen = null;
let state = { items: [], page: 1, pages: 1, loading: false, term: '' };

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Open the library and resolve with the chosen asset, or null if dismissed.
 * @returns {Promise<{id:number,url:string,alt:string|null}|null>}
 */
export function pickImage() {
  if (!sheet) build();

  return new Promise((resolve) => {
    resolveOpen = resolve;
    open();
  });
}

/**
 * Turn every [data-media-field] inside `root` into a preview + chooser.
 * Safe to call more than once; already-mounted fields are skipped.
 */
export function mountImageFields(root = document) {
  root.querySelectorAll('[data-media-field]:not([data-mounted])').forEach((host) => {
    host.dataset.mounted = '1';
    renderField(host);
  });
}

/* ------------------------------------------------------------------ *
 * The declarative field
 * ------------------------------------------------------------------ */

function renderField(host) {
  const name = host.dataset.mediaField;
  const label = host.dataset.label || 'Image';
  const value = host.dataset.value || '';

  host.classList.add('mfield');
  host.innerHTML = `
    <span class="mfield__label">${escape(label)}</span>
    <div class="mfield__body">
      <div class="mfield__thumb" data-thumb>
        ${value ? `<img src="${escape(value)}" alt="">` : '<span class="mfield__empty">No image</span>'}
      </div>
      <div class="mfield__actions">
        <button type="button" class="mbtn" data-choose>${value ? 'Change' : 'Choose image'}</button>
        <button type="button" class="mbtn mbtn--quiet" data-clear ${value ? '' : 'hidden'}>Remove</button>
      </div>
    </div>
    <input type="hidden" name="${escape(name)}" value="${escape(value)}">`;

  const input = host.querySelector('input');
  const thumb = host.querySelector('[data-thumb]');
  const choose = host.querySelector('[data-choose]');
  const clear = host.querySelector('[data-clear]');

  const set = (url) => {
    input.value = url || '';
    host.dataset.value = url || '';
    thumb.innerHTML = url
      ? `<img src="${escape(url)}" alt="">`
      : '<span class="mfield__empty">No image</span>';
    choose.textContent = url ? 'Change' : 'Choose image';
    clear.hidden = !url;

    // Let the host screen react — a category form uses this to enable Save.
    host.dispatchEvent(new CustomEvent('media:change', {
      bubbles: true,
      detail: { name, url: url || null },
    }));
  };

  choose.addEventListener('click', async () => {
    const asset = await pickImage();
    if (asset) set(asset.url);
  });

  clear.addEventListener('click', () => set(''));
}

/* ------------------------------------------------------------------ *
 * The sheet
 * ------------------------------------------------------------------ */

function build() {
  sheet = document.createElement('div');
  sheet.className = 'msheet';
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="msheet__scrim" data-close></div>
    <div class="msheet__panel" role="dialog" aria-modal="true" aria-label="Choose an image">
      <header class="msheet__head">
        <h2 class="msheet__title">Images</h2>
        <button type="button" class="msheet__x" data-close aria-label="Close">&times;</button>
      </header>

      <div class="msheet__drop" data-drop>
        <input type="file" accept="${ACCEPT}" multiple hidden data-file>
        <p class="msheet__droptext">
          <strong>Tap to upload</strong>
          <span>or drag images here &middot; JPG, PNG, WebP &middot; up to 8&nbsp;MB</span>
        </p>
      </div>

      <div class="msheet__queue" data-queue hidden></div>

      <label class="msheet__search">
        <input type="search" placeholder="Search images" data-search>
      </label>

      <div class="msheet__grid" data-grid></div>

      <div class="msheet__more">
        <button type="button" class="mbtn mbtn--quiet" data-more hidden>Load more</button>
      </div>
    </div>`;

  document.body.append(sheet);

  sheet.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', () => close(null)));

  const file = sheet.querySelector('[data-file]');
  const drop = sheet.querySelector('[data-drop]');

  drop.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    upload([...file.files]);
    file.value = '';           // so choosing the same file twice still fires
  });

  ['dragenter', 'dragover'].forEach((e) =>
    drop.addEventListener(e, (ev) => {
      ev.preventDefault();
      drop.classList.add('is-over');
    }));
  ['dragleave', 'drop'].forEach((e) =>
    drop.addEventListener(e, (ev) => {
      ev.preventDefault();
      drop.classList.remove('is-over');
    }));
  drop.addEventListener('drop', (ev) => upload([...(ev.dataTransfer?.files || [])]));

  let debounce;
  sheet.querySelector('[data-search]').addEventListener('input', (ev) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.term = ev.target.value.trim();
      load(1);
    }, 250);
  });

  sheet.querySelector('[data-more]').addEventListener('click', () => load(state.page + 1));

  // Escape closes, because a modal that traps you is worse than no modal.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !sheet.hidden) close(null);
  });
}

function open() {
  sheet.hidden = false;
  // Two frames: one to un-hide, one so the transition has a start state to
  // move from. Adding the class in the same frame skips the animation.
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));

  document.body.style.overflow = 'hidden';
  load(1);
}

function close(value) {
  sheet.classList.remove('is-open');
  document.body.style.overflow = '';

  const done = () => { sheet.hidden = true; };
  sheet.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 400);   // in case the transition never fires

  const resolve = resolveOpen;
  resolveOpen = null;
  resolve?.(value);
}

/* ------------------------------------------------------------------ *
 * Library
 * ------------------------------------------------------------------ */

async function load(page) {
  if (state.loading) return;
  state.loading = true;

  const grid = sheet.querySelector('[data-grid]');
  if (page === 1) grid.innerHTML = '<p class="msheet__note">Loading…</p>';

  let res;
  try {
    const q = state.term ? `&q=${encodeURIComponent(state.term)}` : '';
    res = await adminFetch(`/media?page=${page}${q}`);
  } catch (err) {
    state.loading = false;
    grid.innerHTML = `<p class="msheet__note">${escape(err.message)}</p>`;
    return;
  }

  state.loading = false;
  state.page = res.meta.page;
  state.pages = res.meta.pages;
  state.items = page === 1 ? res.data : [...state.items, ...res.data];

  paintGrid();
}

function paintGrid() {
  const grid = sheet.querySelector('[data-grid]');

  if (!state.items.length) {
    grid.innerHTML = `<p class="msheet__note">${
      state.term ? 'Nothing matches that.' : 'No images yet — upload your first one above.'
    }</p>`;
  } else {
    grid.innerHTML = state.items.map(tile).join('');
    grid.querySelectorAll('[data-pick]').forEach((el) => {
      el.addEventListener('click', () => {
        const asset = state.items.find((a) => String(a.id) === el.dataset.pick);
        if (asset) close(asset);
      });
    });
  }

  sheet.querySelector('[data-more]').hidden = state.page >= state.pages;
}

function tile(a) {
  return `
    <button type="button" class="mtile" data-pick="${a.id}" title="${escape(a.name)}">
      <img src="${escape(a.url)}" alt="${escape(a.alt || '')}" loading="lazy">
      ${a.usedBy ? `<span class="mtile__used">${a.usedBy}</span>` : ''}
    </button>`;
}

/* ------------------------------------------------------------------ *
 * Upload
 * ------------------------------------------------------------------ */

function upload(files) {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;

  const queue = sheet.querySelector('[data-queue]');
  queue.hidden = false;

  // Each file is its own request. One 8 MB photo failing on a patchy mobile
  // connection must not discard the four that already went up.
  images.forEach((file) => {
    const row = document.createElement('div');
    row.className = 'mrow';
    row.innerHTML = `
      <span class="mrow__name">${escape(file.name)}</span>
      <span class="mrow__bar"><i style="width:0%"></i></span>
      <span class="mrow__state">waiting</span>`;
    queue.append(row);

    if (file.size > MAX_BYTES) {
      fail(row, 'over 8 MB');
      return;
    }

    send(file, row);
  });
}

async function send(file, row) {
  const bar = row.querySelector('.mrow__bar i');
  const label = row.querySelector('.mrow__state');
  label.textContent = 'uploading';

  let headers;
  try {
    headers = await csrfHeader();
  } catch {
    return fail(row, 'session expired');
  }

  // XHR rather than fetch, only because fetch still has no upload progress in
  // any shipping browser. On mobile data an 8 MB photo is a slow minute, and a
  // spinner with no progress reads as a hang.
  const xhr = new XMLHttpRequest();
  const body = new FormData();
  body.append('file', file);

  xhr.upload.addEventListener('progress', (ev) => {
    if (ev.lengthComputable) {
      bar.style.width = `${Math.round((ev.loaded / ev.total) * 100)}%`;
    }
  });

  xhr.addEventListener('load', () => {
    let payload = {};
    try { payload = JSON.parse(xhr.responseText); } catch { /* keep {} */ }

    if (xhr.status >= 200 && xhr.status < 300) {
      bar.style.width = '100%';
      row.classList.add('is-done');
      label.textContent = payload.duplicate ? 'already had it' : 'done';

      if (payload.data) {
        // Newest first, and de-duplicated: an existing image re-uploaded must
        // not appear twice in the grid.
        state.items = [payload.data, ...state.items.filter((a) => a.id !== payload.data.id)];
        paintGrid();
      }

      setTimeout(() => row.remove(), 2000);
      return;
    }

    fail(row, payload.message || `failed (${xhr.status})`);
  });

  xhr.addEventListener('error', () => fail(row, 'network error'));

  xhr.open('POST', '/api/admin/media');
  xhr.withCredentials = true;
  xhr.setRequestHeader('Accept', 'application/json');
  Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
  // Content-Type is deliberately NOT set: the browser must add the multipart
  // boundary itself, and setting it by hand produces a body PHP cannot parse.
  xhr.send(body);
}

function fail(row, message) {
  row.classList.add('is-failed');
  row.querySelector('.mrow__state').textContent = message;
}

/* ------------------------------------------------------------------ */

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
