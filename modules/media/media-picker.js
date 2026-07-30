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

/**
 * Turn every [data-media-gallery] inside `root` into an ordered photo strip.
 *
 * Markup:
 *   <div data-media-gallery="images" data-value='["/uploads/a.webp"]'></div>
 *
 * It keeps a hidden <input name="images"> holding the list as JSON, and emits
 * `media:change` with the array whenever it moves. Read it with
 * `JSON.parse(form.images.value)`.
 */
export function mountGalleryFields(root = document) {
  root.querySelectorAll('[data-media-gallery]:not([data-mounted])').forEach((host) => {
    host.dataset.mounted = '1';
    renderGallery(host);
  });
}

/* ------------------------------------------------------------------ *
 * The gallery
 * ------------------------------------------------------------------ */

function renderGallery(host) {
  const name = host.dataset.mediaGallery;
  const max = Number(host.dataset.max || 12);

  let list;
  try { list = JSON.parse(host.dataset.value || '[]'); } catch { list = []; }
  if (!Array.isArray(list)) list = [];

  host.classList.add('mgal');
  host.innerHTML = `
    <div class="mgal__strip" data-strip></div>
    <div class="mgal__foot">
      <button type="button" class="mbtn" data-add>+ Add photo</button>
      <span class="mgal__hint" data-hint></span>
    </div>
    <input type="hidden" name="${escape(name)}" value="">`;

  const strip = host.querySelector('[data-strip]');
  const hidden = host.querySelector('input');
  const add = host.querySelector('[data-add]');
  const hint = host.querySelector('[data-hint]');

  const commit = () => {
    hidden.value = JSON.stringify(list);
    host.dataset.value = hidden.value;
    add.disabled = list.length >= max;
    hint.textContent = list.length
      ? `${list.length} of ${max} · the first one is the main photo`
      : 'No photos yet';

    strip.innerHTML = list.map(frame).join('');

    strip.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i);

        if (btn.dataset.act === 'remove') list.splice(i, 1);
        if (btn.dataset.act === 'left' && i > 0) swap(list, i, i - 1);
        if (btn.dataset.act === 'right' && i < list.length - 1) swap(list, i, i + 1);
        if (btn.dataset.act === 'main' && i > 0) list.unshift(...list.splice(i, 1));

        commit();
      });
    });

    host.dispatchEvent(new CustomEvent('media:change', {
      bubbles: true,
      detail: { name, images: [...list] },
    }));
  };

  add.addEventListener('click', async () => {
    const asset = await pickImage();
    if (!asset) return;

    // Silently ignoring a duplicate would look like the click did nothing, so
    // it moves to the end instead — which is at least a visible result and is
    // usually what someone re-picking an image meant.
    const at = list.indexOf(asset.url);
    if (at !== -1) list.splice(at, 1);

    list.push(asset.url);
    commit();
  });

  commit();
}

/**
 * Arrows and an explicit "Make main", not drag-and-drop.
 *
 * Dragging a thumbnail on a touch screen fights the page scroll, and the
 * fallbacks for it are worse than the buttons. Reordering four photos with two
 * taps each is not the bottleneck; failing to reorder them at all is.
 */
function frame(url, i, all) {
  const first = i === 0;
  const last = i === all.length - 1;

  return `
    <figure class="mgal__item${first ? ' is-main' : ''}">
      <img src="${escape(url)}" alt="">
      ${first ? '<figcaption class="mgal__badge">Main</figcaption>' : ''}
      <div class="mgal__acts">
        <button type="button" data-act="left"  data-i="${i}" ${first ? 'disabled' : ''} title="Move earlier" aria-label="Move earlier">&#8592;</button>
        ${first
          ? ''
          : `<button type="button" data-act="main" data-i="${i}" title="Make this the main photo" aria-label="Make main">&#9733;</button>`}
        <button type="button" data-act="right" data-i="${i}" ${last ? 'disabled' : ''} title="Move later" aria-label="Move later">&#8594;</button>
        <button type="button" data-act="remove" data-i="${i}" class="is-danger" title="Remove" aria-label="Remove">&times;</button>
      </div>
    </figure>`;
}

function swap(arr, a, b) {
  [arr[a], arr[b]] = [arr[b], arr[a]];
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
