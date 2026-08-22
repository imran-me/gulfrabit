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

import { adminFetch } from '/modules/admin/backend/api.js';
import { fetchTree, folderIcon, trail } from './folders.js';
import { ACCEPT, uploadFiles } from './uploader.js';

let sheet = null;
let resolveOpen = null;

/**
 * `scope` is 'all', 'root' (the top level) or a folder id — the same three
 * values the Images screen uses, so the two screens agree on what "where you
 * are" means.
 */
let state = {
  items: [], page: 1, pages: 1, loading: false, term: '',
  scope: 'all',
  tree: { list: [], byId: new Map(), roots: [], unfiled: 0, total: 0 },
};

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Open the library and resolve with the chosen asset, or null if dismissed.
 *
 * @param {{folderId?: number|null}} [opts]
 *   Where to open, and where uploads land. A product screen passes nothing and
 *   gets the whole library; the Images screen passes the folder the merchant
 *   is standing in, so "Upload images" while inside "Ramadan 2026" files them
 *   there rather than dumping them at the top level to be sorted later.
 *
 * @returns {Promise<{id:number,url:string,alt:string|null}|null>}
 */
export function pickImage(opts = {}) {
  if (!sheet) build();

  state.scope = opts.folderId != null ? opts.folderId : 'all';
  state.term = '';

  const search = sheet.querySelector('[data-search]');
  if (search) search.value = '';

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

      <!-- Browsing, not just searching. Once a library is filed into folders,
           a flat wall of every picture ever uploaded is the thing folders were
           created to escape — so the picker walks the same tree the Images
           screen does. -->
      <nav class="msheet__crumbs" data-crumbs aria-label="Folder"></nav>

      <div class="msheet__folders" data-folders hidden></div>

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

  // Walking into a folder, and back out along the crumbs.
  [sheet.querySelector('[data-crumbs]'), sheet.querySelector('[data-folders]')].forEach((host) => {
    host.addEventListener('click', (ev) => {
      const go = ev.target.closest('[data-go]');
      if (!go) return;

      state.scope = go.dataset.go === 'all' || go.dataset.go === 'root'
        ? go.dataset.go
        : Number(go.dataset.go);

      load(1);
    });
  });

  sheet.querySelector('[data-more]').addEventListener('click', () => load(state.page + 1));

  // Escape closes, because a modal that traps you is worse than no modal.
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !sheet.hidden) close(null);
  });
}

function open() {
  sheet.hidden = false;
  refreshTree();
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

/**
 * The folder tree, refreshed each time the sheet opens.
 *
 * Fire and forget, and never fatal: the picker's job is to hand back an image,
 * and it can still do that with no tree at all. A folder created on another
 * tab two minutes ago should show up, and a failed tree request should not
 * stop someone choosing a photo.
 */
async function refreshTree() {
  try {
    state.tree = await fetchTree();
  } catch {
    return;   // browsing degrades to the flat list; picking still works
  }

  if (typeof state.scope === 'number' && !state.tree.byId.has(state.scope)) {
    state.scope = 'all';
  }

  paintCrumbs();
  paintFolders();
}

async function load(page) {
  if (state.loading) return;
  state.loading = true;

  const grid = sheet.querySelector('[data-grid]');
  if (page === 1) grid.innerHTML = '<p class="msheet__note">Loading…</p>';

  // Searching looks everywhere, for the same reason it does on the Images
  // screen: someone typing a file name is trying to find a picture, not to
  // filter the folder they happen to be standing in.
  const where = state.term ? 'all' : state.scope;

  let res;
  try {
    const q = state.term ? `&q=${encodeURIComponent(state.term)}` : '';
    res = await adminFetch(`/media?folder=${where}&page=${page}${q}`);
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

/** The trail, plus the two views that are not folders at all. */
function paintCrumbs() {
  const el = sheet.querySelector('[data-crumbs]');
  if (!el) return;

  // Nothing to browse and nothing to explain — a library with no folders looks
  // exactly as it did before folders existed.
  if (!state.tree.list.length) {
    el.innerHTML = '';
    return;
  }

  if (state.term) {
    el.innerHTML = '<span class="msheet__crumb is-now">Every folder</span>';
    return;
  }

  const parts = trail(state.tree, typeof state.scope === 'number' ? state.scope : null);

  const head = [
    state.scope === 'all'
      ? '<span class="msheet__crumb is-now">All images</span>'
      : '<button type="button" class="msheet__crumb" data-go="all">All images</button>',
    state.scope === 'root'
      ? '<span class="msheet__crumb is-now">Top level</span>'
      : '<button type="button" class="msheet__crumb" data-go="root">Top level</button>',
  ];

  const rest = parts.map((c, i) => (i === parts.length - 1
    ? `<span class="msheet__crumb is-now">${escape(c.name)}</span>`
    : `<button type="button" class="msheet__crumb" data-go="${c.id}">${escape(c.name)}</button>`));

  el.innerHTML = [...head, ...rest].join('<span class="msheet__sep" aria-hidden="true">/</span>');
}

/** Subfolders of wherever we are, as a row of chips above the thumbnails. */
function paintFolders() {
  const el = sheet.querySelector('[data-folders]');
  if (!el) return;

  const kids = state.term || state.scope === 'all'
    ? []
    : state.scope === 'root'
      ? state.tree.roots
      : state.tree.byId.get(state.scope)?.children ?? [];

  el.hidden = !kids.length;
  el.innerHTML = kids.map((f) => `
    <button type="button" class="msheet__folder" data-go="${f.id}">
      ${folderIcon()}
      <span>${escape(f.name)}</span>
      ${f.imagesDeep ? `<small>${f.imagesDeep}</small>` : ''}
    </button>`).join('');
}

function paintGrid() {
  const grid = sheet.querySelector('[data-grid]');

  paintCrumbs();
  paintFolders();

  if (!state.items.length) {
    grid.innerHTML = `<p class="msheet__note">${
      state.term
        ? 'Nothing matches that.'
        : state.tree.list.length && state.scope !== 'all'
          ? 'Nothing here yet — open another folder, or upload straight into this one.'
          : 'No images yet — upload your first one above.'
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
 *
 * The mechanics live in uploader.js, shared with the Images screen. All this
 * knows is which folder is open and what to do with a row that lands.
 * ------------------------------------------------------------------ */

async function upload(files) {
  await uploadFiles(files, {
    folderId: typeof state.scope === 'number' ? state.scope : null,
    queue: sheet.querySelector('[data-queue]'),
    onUploaded: (data) => {
      // Newest first, and de-duplicated: an existing image re-uploaded must
      // not appear twice in the grid.
      //
      // Shown only if it actually belongs in the view being looked at. A
      // re-upload of a photo already filed elsewhere comes back with its
      // existing folder, and dropping it into this grid would claim it is in
      // a folder it is not in.
      const belongs = state.scope === 'all'
        || (state.scope === 'root' && data.folderId == null)
        || data.folderId === state.scope;

      if (!belongs) return;

      state.items = [data, ...state.items.filter((a) => a.id !== data.id)];
      paintGrid();
    },
  });

  // A new folder cannot appear from an upload, but the counts on the chips can
  // change, and a stale "12" beside a folder that now holds 15 is the kind of
  // small wrongness that makes someone stop trusting the numbers.
  refreshTree();
}

/* ------------------------------------------------------------------ */

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
