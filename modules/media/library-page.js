/**
 * library-page.js — the Images screen: a file manager for the library.
 *
 * WHAT IT IS. A folder tree on the left, the contents of one folder on the
 * right, drag to file, multi-select to file in bulk. The shape everyone
 * already knows from their computer, because a merchant filing three hundred
 * product photos should not have to learn a new one.
 *
 * WHAT A FOLDER IS. Filing, and nothing else. The web address of an image does
 * not contain its folder and never will, so moving pictures around cannot
 * break the live shop — see the migration for why that decision drives
 * everything else. This screen says so out loud, once, at the top, because a
 * merchant who is not sure whether reorganising is safe never reorganises.
 *
 * THE THREE RULES THIS SCREEN IS BUILT ON
 * ---------------------------------------
 * 1. **Every gesture has a plain twin.** Drag files onto a folder, or press
 *    "Move to folder…". Shift-click a range, or tick the boxes. A drag is hard
 *    on a touch screen and impossible from a keyboard, so it is always the
 *    fast path and never the only path.
 *
 * 2. **Reversible things do not ask; irreversible things do.** Filing is
 *    high-volume and low-stakes — a merchant moves forty pictures and gets one
 *    wrong. Confirming all forty to catch the one is the wrong trade, so moves
 *    offer Undo instead. Deleting a file has nothing to undo it with, so that
 *    one asks first, every time.
 *
 * 3. **The panel says what it did.** Every write raises a toast naming the
 *    result, because on a long grid the only other feedback is a thumbnail
 *    quietly appearing or vanishing somewhere off screen.
 *
 * It does not reimplement uploading or the picker: "Upload images" opens the
 * same sheet every other screen uses, pointed at the folder currently open.
 */

import { adminFetch } from '/modules/admin/backend/api.js';
import { escapeHtml } from '/modules/admin/admin-shell.js';
import { pickImage } from './media-picker.js';
import { closeDrawer, isDrawerOpen, openDrawer, refreshDrawer } from './image-drawer.js';
import { isFileDrag, uploadFiles } from './uploader.js';
import { toast } from './toast.js';
import {
  askConfirm,
  askFolder,
  chooseFolder,
  createFolder,
  deleteFolder,
  fetchTree,
  folderIcon,
  homeIcon,
  moveAssets,
  patchFolder,
  stackIcon,
  subtreeIds,
  trail,
} from './folders.js';

/** How the merchant left the screen. Restored on the next visit. */
const REMEMBER = 'gr:media-view';

const SORTS = [
  ['new', 'Newest first'],
  ['old', 'Oldest first'],
  ['name', 'Name A–Z'],
  ['large', 'Largest file'],
  ['used', 'Most used'],
];

let tree = { list: [], byId: new Map(), roots: [], unfiled: 0, total: 0 };

/** 'all' | 'root' | a folder id. Never a folder object — ids survive a reload. */
let scope = 'root';
let deep = false;
let term = '';
let sort = 'new';
let view = 'grid';
let size = 'm';

let items = [];
let page = 1;
let pages = 1;
let shown = 0;
let loading = false;

const selected = new Set();
const expanded = new Set();

/** Anchor for shift-click, the way every file manager does a range. */
let anchor = null;

/** What is under the cursor mid-drag. A module variable, not dataTransfer:
 *  Safari will not let you READ dataTransfer during dragover, which is exactly
 *  when a drop target has to decide whether it is a legal target. */
let dragging = null;

let sentinel = null;

document.addEventListener('admin:ready', init);

async function init() {
  if (!document.querySelector('[data-lib-grid]')) return;

  restore();
  paintToolbar();
  wire();

  await refreshTree();
  load(1);
}

/* ------------------------------------------------------------------ *
 * Wiring — delegated, because both panes are repainted wholesale
 * ------------------------------------------------------------------ */

function wire() {
  const treeEl = document.querySelector('[data-lib-tree]');
  const foldersEl = document.querySelector('[data-lib-folders]');
  const gridEl = document.querySelector('[data-lib-grid]');
  const crumbsEl = document.querySelector('[data-lib-crumbs]');
  const mfm = document.querySelector('.mfm');

  document.querySelector('[data-lib-upload]')?.addEventListener('click', async () => {
    // The sheet resolves with whatever was picked, which we ignore — the point
    // here was the upload, and the grid needs the new rows either way.
    await pickImage({ folderId: currentFolderId() });
    await refreshTree();
    load(1);
  });

  document.querySelector('[data-lib-newfolder]')
    ?.addEventListener('click', () => newFolder(currentFolderId()));

  document.querySelector('[data-lib-newfolder-root]')
    ?.addEventListener('click', () => newFolder(null));

  let debounce;
  document.querySelector('[data-lib-search]')?.addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      term = e.target.value.trim();
      clearSelection();
      load(1);
    }, 250);
  });

  document.querySelector('[data-lib-deep]')?.addEventListener('change', (e) => {
    deep = e.target.checked;
    load(1);
  });

  document.querySelector('[data-lib-sort]')?.addEventListener('change', (e) => {
    sort = e.target.value;
    remember();
    load(1);
  });

  document.querySelector('[data-lib-view]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;

    view = btn.dataset.view;
    remember();
    paintToolbar();
    paint();
  });

  document.querySelector('[data-lib-size]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-size]');
    if (!btn) return;

    size = btn.dataset.size;
    remember();
    paintToolbar();
    paint();
  });

  document.querySelector('[data-lib-more]')?.addEventListener('click', () => load(page + 1));

  document.querySelector('[data-bulk-clear]')?.addEventListener('click', clearSelection);
  document.querySelector('[data-bulk-move]')?.addEventListener('click', moveSelection);
  document.querySelector('[data-bulk-delete]')?.addEventListener('click', deleteSelection);
  document.querySelector('[data-bulk-all]')?.addEventListener('click', selectAll);

  /* --- the tree ------------------------------------------------------ */

  treeEl.addEventListener('click', (e) => {
    const twist = e.target.closest('[data-twist]');
    if (twist) {
      const id = Number(twist.dataset.twist);
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
      remember();
      return paintTree();
    }

    const menu = e.target.closest('[data-menu]');
    if (menu) return openMenu(menu, Number(menu.dataset.menu));

    const go = e.target.closest('[data-go]');
    if (go) return goTo(go.dataset.go);
  });

  /* --- crumbs and folder tiles --------------------------------------- */

  crumbsEl.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) goTo(go.dataset.go);
  });

  foldersEl.addEventListener('click', (e) => {
    const menu = e.target.closest('[data-menu]');
    if (menu) return openMenu(menu, Number(menu.dataset.menu));

    const go = e.target.closest('[data-go]');
    if (go) goTo(go.dataset.go);
  });

  /* --- the grid ------------------------------------------------------ */

  gridEl.addEventListener('change', (e) => {
    const box = e.target.closest('[data-sel]');
    if (box) pickOne(Number(box.dataset.sel), box.checked, e);
  });

  gridEl.addEventListener('click', (e) => {
    // A shift-click anywhere on a card extends the selection instead of
    // opening it — the file-manager gesture, and the only way to take fifty
    // images without fifty clicks.
    const card = e.target.closest('[data-item]');

    if (card && e.shiftKey) {
      e.preventDefault();
      return extendTo(Number(card.dataset.item));
    }

    if (e.target.closest('[data-sel], .mlib__sel')) return;   // the checkbox

    const open = e.target.closest('[data-open]');
    if (open) return show(Number(open.dataset.open));

    const del = e.target.closest('[data-del]');
    if (del) return remove(Number(del.dataset.del));
  });

  gridEl.addEventListener('blur', (e) => {
    // Save on blur, not on every keystroke: alt text is a sentence, and a
    // request per character would be both wasteful and jumpy on mobile data.
    if (e.target.matches('[data-alt]')) saveAlt(e.target.dataset.alt, e.target.value.trim(), e.target);
  }, true);

  gridEl.addEventListener('keydown', (e) => {
    if (e.target.matches('[data-alt]') && e.key === 'Enter') e.target.blur();
  });

  /* --- drag: images and folders, inside the screen -------------------- */

  [gridEl, foldersEl, treeEl].forEach((host) => {
    host.addEventListener('dragstart', onDragStart);
    host.addEventListener('dragend', onDragEnd);
  });

  [foldersEl, treeEl, crumbsEl].forEach((host) => {
    host.addEventListener('dragover', onDragOver);
    host.addEventListener('dragleave', onDragLeave);
    host.addEventListener('drop', onDrop);
  });

  /* --- drag: files, from the desktop ---------------------------------- */

  mfm.addEventListener('dragover', onFileOver);
  mfm.addEventListener('dragleave', onFileLeave);
  mfm.addEventListener('drop', onFileDrop);

  // Without this, a near-miss drop makes the browser NAVIGATE to the image
  // file — the panel disappears and the merchant is looking at a JPEG with no
  // idea what they did. The one case where preventing a default is the whole
  // feature.
  ['dragover', 'drop'].forEach((type) => {
    document.addEventListener(type, (e) => { if (isFileDrag(e)) e.preventDefault(); });
  });

  /* --- keyboard ------------------------------------------------------- */

  document.addEventListener('keydown', onKey);

  /* --- infinite scroll ------------------------------------------------ */

  sentinel = document.querySelector('[data-lib-sentinel]');

  if (sentinel && 'IntersectionObserver' in window) {
    // Auto-load, with the button left in place beneath it. The observer is the
    // comfortable path; the button is what still works when the observer does
    // not fire — inside a container that never scrolls, or with the tab in the
    // background — and it costs one line of markup to never be stuck.
    new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && page < pages) load(page + 1);
    }, { rootMargin: '600px' }).observe(sentinel);
  }
}

function onKey(e) {
  const typing = e.target.matches('input, textarea, select');

  // "/" jumps to search, the way it does in every tool that has a search box.
  if (e.key === '/' && !typing) {
    e.preventDefault();
    return document.querySelector('[data-lib-search]')?.focus();
  }

  if (e.key === 'Escape' && !typing && selected.size) {
    e.preventDefault();
    return clearSelection();
  }

  if ((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey) && !typing) {
    e.preventDefault();
    return selectAll();
  }

  // Delete acts on the selection, and only ever asks first — see rule 2 at the
  // top. A stray Delete keypress must not be able to remove a photo.
  if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selected.size && !isDrawerOpen()) {
    e.preventDefault();
    deleteSelection();
  }
}

/* ------------------------------------------------------------------ *
 * Where we are, and how it is shown
 * ------------------------------------------------------------------ */

function currentFolderId() {
  return typeof scope === 'number' ? scope : null;
}

function folderName(id) {
  return id == null ? 'the top level' : tree.byId.get(id)?.name ?? 'that folder';
}

function goTo(next) {
  scope = next === 'all' || next === 'root' ? next : Number(next);
  deep = false;
  clearSelection();
  closeDrawer();
  remember();

  // Opening a folder opens its ancestors, so the sidebar always shows where
  // you are rather than making you find it again.
  trail(tree, currentFolderId()).forEach((c) => expanded.add(c.id));

  paintTree();
  load(1);
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER) || '{}');

    if (saved.scope != null) {
      scope = saved.scope === 'all' || saved.scope === 'root' ? saved.scope : Number(saved.scope);
    }

    if (SORTS.some(([k]) => k === saved.sort)) sort = saved.sort;
    if (saved.view === 'grid' || saved.view === 'list') view = saved.view;
    if (['s', 'm', 'l'].includes(saved.size)) size = saved.size;
    if (Array.isArray(saved.open)) saved.open.forEach((id) => expanded.add(id));
  } catch { /* private mode, or junk — the defaults stand */ }
}

function remember() {
  try {
    localStorage.setItem(REMEMBER, JSON.stringify({
      scope, sort, view, size, open: [...expanded],
    }));
  } catch { /* fine — it is a convenience, not state */ }
}

/* ------------------------------------------------------------------ *
 * The tree
 * ------------------------------------------------------------------ */

async function refreshTree() {
  try {
    tree = await fetchTree();
  } catch (err) {
    document.querySelector('[data-lib-tree]').innerHTML =
      `<p class="mtree__empty">${escapeHtml(err.message)}</p>`;
    return;
  }

  // A remembered folder that has since been deleted must not leave the screen
  // pointing at nothing — fall back to the top level rather than showing an
  // empty folder that cannot be explained.
  if (typeof scope === 'number' && !tree.byId.has(scope)) scope = 'root';

  trail(tree, currentFolderId()).forEach((c) => expanded.add(c.id));

  paintTree();
}

function paintTree() {
  const el = document.querySelector('[data-lib-tree]');

  el.innerHTML = `
    ${flatRow({ key: 'all', label: 'All images', count: tree.total, icon: stackIcon(), drop: false })}
    ${flatRow({ key: 'root', label: 'Top level', count: tree.unfiled, icon: homeIcon(), drop: true })}
    <div class="mtree__kids">${tree.roots.map((f) => branch(f)).join('')}</div>
    ${tree.roots.length
      ? ''
      : '<p class="mtree__empty">No folders yet. Make one, then drag pictures into it.</p>'}`;

  paintCrumbs();
}

function flatRow({ key, label, count, icon, drop }) {
  const on = String(scope) === String(key);

  return `
    <div class="mtree__row${on ? ' is-on' : ''}"${drop ? ` data-drop="${key}"` : ''}>
      <span class="mtree__twist" aria-hidden="true"></span>
      <button type="button" class="mtree__label" data-go="${key}"${on ? ' aria-current="true"' : ''}>
        ${icon}<span>${escapeHtml(label)}</span>
        ${count ? `<small>${count}</small>` : ''}
      </button>
    </div>`;
}

function branch(folder) {
  const open = expanded.has(folder.id);
  const on = scope === folder.id;
  const kids = folder.children;

  return `
    <div class="mtree__node">
      <div class="mtree__row${on ? ' is-on' : ''}" data-drop="${folder.id}"
           draggable="true" data-drag-folder="${folder.id}"
           ${folder.color ? `data-c="${folder.color}"` : ''}>
        ${kids.length
          ? `<button type="button" class="mtree__twist${open ? ' is-open' : ''}" data-twist="${folder.id}"
                     aria-label="${open ? 'Collapse' : 'Expand'} ${escapeHtml(folder.name)}"
                     aria-expanded="${open}">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 6 6 6-6 6"/></svg>
             </button>`
          : '<span class="mtree__twist" aria-hidden="true"></span>'}

        <button type="button" class="mtree__label" data-go="${folder.id}"
                title="${escapeHtml(folder.name)}"${on ? ' aria-current="true"' : ''}>
          ${folderIcon(open && kids.length > 0)}<span>${escapeHtml(folder.name)}</span>
          ${folder.images ? `<small>${folder.images}</small>` : ''}
        </button>

        <button type="button" class="mtree__more" data-menu="${folder.id}"
                aria-label="Actions for ${escapeHtml(folder.name)}">&#8942;</button>
      </div>

      ${kids.length && open
        ? `<div class="mtree__kids">${kids.map((f) => branch(f)).join('')}</div>`
        : ''}
    </div>`;
}

function paintCrumbs() {
  const el = document.querySelector('[data-lib-crumbs]');

  if (term) {
    el.innerHTML = '<span class="mfm__crumb is-now">Search results — every folder</span>';
  } else if (scope === 'all') {
    el.innerHTML = '<span class="mfm__crumb is-now">All images</span>';
  } else {
    const parts = trail(tree, currentFolderId());

    el.innerHTML = [
      '<button type="button" class="mfm__crumb" data-go="root" data-drop="root">Top level</button>',
      ...parts.map((c, i) => (i === parts.length - 1
        ? `<span class="mfm__crumb is-now">${escapeHtml(c.name)}</span>`
        : `<button type="button" class="mfm__crumb" data-go="${c.id}" data-drop="${c.id}">${escapeHtml(c.name)}</button>`)),
    ].join('<span class="mfm__sep" aria-hidden="true">/</span>');
  }

  const wrap = document.querySelector('[data-lib-deep-wrap]');
  wrap.hidden = typeof scope !== 'number' || !!term;
  document.querySelector('[data-lib-deep]').checked = deep;
}

/** The view controls. Painted once from state so the markup cannot disagree. */
function paintToolbar() {
  const sortEl = document.querySelector('[data-lib-sort]');

  if (sortEl && !sortEl.options.length) {
    sortEl.innerHTML = SORTS.map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  }

  if (sortEl) sortEl.value = sort;

  document.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.view === view);
    b.setAttribute('aria-pressed', String(b.dataset.view === view));
  });

  document.querySelectorAll('[data-size]').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.size === size);
    b.setAttribute('aria-pressed', String(b.dataset.size === size));
  });

  // Thumbnail size means nothing in a list of rows.
  document.querySelector('[data-lib-size]').hidden = view !== 'grid';
}

/* ------------------------------------------------------------------ *
 * Folder actions
 * ------------------------------------------------------------------ */

async function newFolder(parentId) {
  const parent = parentId != null ? tree.byId.get(parentId) : null;

  const answer = await askFolder({
    title: parent ? `New folder in "${parent.name}"` : 'New top-level folder',
    confirm: 'Create folder',
  });

  if (!answer) return;

  try {
    const res = await createFolder({ ...answer, parentId });
    await refreshTree();
    if (parentId != null) expanded.add(parentId);
    goTo(String(res.data.id));
    toast(`Folder "${answer.name}" created.`);
  } catch (err) {
    toast(err.message, { tone: 'bad' });
  }
}

async function editFolder(id) {
  const folder = tree.byId.get(id);
  if (!folder) return;

  const answer = await askFolder({
    title: 'Rename folder',
    name: folder.name,
    color: folder.color,
    confirm: 'Save',
  });

  if (!answer) return;
  if (answer.name === folder.name && answer.color === folder.color) return;

  try {
    await patchFolder(id, { name: answer.name, color: answer.color });
    await refreshTree();
    paint();
    toast('Folder updated.');
  } catch (err) {
    toast(err.message, { tone: 'bad' });
  }
}

async function moveFolder(id) {
  const folder = tree.byId.get(id);
  if (!folder) return;

  const answer = await chooseFolder({
    title: `Move "${folder.name}"`,
    tree,
    // A folder cannot go inside itself or inside its own children — the server
    // refuses it, but greying it out here means never being refused.
    exclude: subtreeIds(tree, id),
    current: folder.parentId,
  });

  if (!answer || answer.id === folder.parentId) return;

  applyFolderMove(id, answer.id, folder.parentId);
}

async function applyFolderMove(id, parentId, wasIn) {
  const name = tree.byId.get(id)?.name ?? 'Folder';

  try {
    await patchFolder(id, { parentId });
  } catch (err) {
    return toast(err.message, { tone: 'bad' });
  }

  await refreshTree();
  if (parentId != null) expanded.add(parentId);
  paintTree();
  paint();

  toast(`"${name}" moved to ${folderName(parentId)}.`, {
    action: wasIn === undefined ? null : {
      label: 'Undo',
      run: () => applyFolderMove(id, wasIn),
    },
  });
}

async function removeFolder(id) {
  const folder = tree.byId.get(id);
  if (!folder) return;

  const empty = !folder.children.length && !folder.images;

  if (!await askConfirm({
    title: `Delete "${folder.name}"?`,
    message: empty
      ? 'The folder is empty, so nothing else changes.'
      : 'Deleting a folder never deletes an image. Anything inside moves up one level.',
    confirm: 'Delete folder',
  })) return;

  try {
    await deleteFolder(id);
  } catch (err) {
    // 409 means it still holds something, and the server's message names what.
    // Asking again with the count in hand is a genuinely different decision
    // from the first click, which is why it is a second question and not a
    // checkbox on the first one.
    if (err.status !== 409) return toast(err.message, { tone: 'bad' });

    if (!await askConfirm({
      title: 'That folder is not empty',
      message: err.message,
      confirm: 'Delete anyway',
    })) return;

    try {
      await deleteFolder(id, true);
    } catch (forced) {
      return toast(forced.message, { tone: 'bad' });
    }
  }

  // Standing where a folder used to be is a blank screen with no explanation,
  // so step up to the parent.
  if (scope === id) scope = folder.parentId ?? 'root';

  expanded.delete(id);
  await refreshTree();
  remember();
  load(1);
  toast('Folder deleted. Nothing left the library.');
}

/** The ⋮ menu on a folder. Built on demand, removed on any click away. */
function openMenu(anchorEl, id) {
  document.querySelector('.mmenu')?.remove();

  const menu = document.createElement('div');
  menu.className = 'mmenu';
  menu.innerHTML = `
    <button type="button" data-act="open">Open</button>
    <button type="button" data-act="new">New subfolder</button>
    <button type="button" data-act="edit">Rename &amp; colour</button>
    <button type="button" data-act="move">Move to…</button>
    <button type="button" data-act="delete" class="is-danger">Delete</button>`;

  const box = anchorEl.getBoundingClientRect();
  menu.style.top = `${box.bottom + window.scrollY + 4}px`;
  menu.style.left = `${Math.min(box.left + window.scrollX, window.innerWidth - 200)}px`;

  document.body.append(menu);
  requestAnimationFrame(() => menu.classList.add('is-in'));

  menu.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    menu.remove();

    if (act === 'open') goTo(String(id));
    if (act === 'new') newFolder(id);
    if (act === 'edit') editFolder(id);
    if (act === 'move') moveFolder(id);
    if (act === 'delete') removeFolder(id);
  });

  // Next click anywhere closes it. Deferred by a frame so the click that
  // opened the menu does not immediately close it again.
  requestAnimationFrame(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  });
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

async function load(next) {
  const grid = document.querySelector('[data-lib-grid]');

  loading = true;

  // Skeletons, not the word "Loading". A grid that keeps its shape while the
  // pictures arrive does not jump the page around under the cursor, and the
  // merchant can see how much is coming.
  if (next === 1) grid.innerHTML = skeletons();

  // Searching is always across the whole library. Someone typing a file name
  // is trying to FIND a picture, and a search that silently only looks in the
  // folder you happen to be standing in answers "no such image" for one that
  // is plainly there.
  const where = term ? 'all' : scope;

  let res;
  try {
    const q = term ? `&q=${encodeURIComponent(term)}` : '';
    const d = deep && typeof where === 'number' ? '&deep=1' : '';
    res = await adminFetch(`/media?folder=${where}&page=${next}&perPage=48&sort=${sort}${q}${d}`);
  } catch (err) {
    loading = false;
    grid.innerHTML = `<p class="mfm__empty">${escapeHtml(err.message)}</p>`;
    return;
  }

  loading = false;
  page = res.meta.page;
  pages = res.meta.pages;
  shown = res.meta.total;
  items = next === 1 ? res.data : [...items, ...res.data];

  paintCount();
  paint();
}

function skeletons() {
  return `<div class="mskel mskel--${view}">${
    Array.from({ length: view === 'list' ? 8 : 12 }, (_, i) =>
      `<div class="mskel__cell" style="--i:${i}"></div>`).join('')
  }</div>`;
}

function paintCount() {
  const here = shown === 1 ? '1 image' : `${shown} images`;

  const label = term
    ? `${here} matching "${term}"`
    : scope === 'all'
      ? here
      : scope === 'root'
        ? `${here} at the top level · ${tree.total} in the library`
        : `${here} in "${folderName(currentFolderId())}"${deep ? ' and its subfolders' : ''} · ${tree.total} in the library`;

  document.querySelector('[data-lib-count]').textContent = shown === 0 && !term
    ? (scope === 'all' ? 'No images yet' : 'This folder is empty')
    : label;
}

/* ------------------------------------------------------------------ *
 * Painting the contents
 * ------------------------------------------------------------------ */

function paint() {
  paintCrumbs();
  paintFolders();

  const grid = document.querySelector('[data-lib-grid]');

  grid.className = view === 'list' ? 'mlist' : `mlib mlib--${size}`;
  grid.innerHTML = items.length
    ? items.map(view === 'list' ? listRow : card).join('')
    : `<div class="mfm__empty">${emptyState()}</div>`;

  document.querySelector('[data-lib-more]').hidden = page >= pages;
  paintBulk();
}

function emptyState() {
  if (term) {
    return `<strong>Nothing matches "${escapeHtml(term)}".</strong>
            <span>Search looks at file names and descriptions, in every folder.</span>`;
  }

  if (scope === 'all') {
    return `<strong>No images yet.</strong>
            <span>Upload your first one, or drag a few straight onto this page.</span>`;
  }

  if (scope === 'root') {
    return `<strong>Nothing filed at the top level.</strong>
            <span>Everything is tucked into a folder — pick one on the left.</span>`;
  }

  return `<strong>This folder is empty.</strong>
          <span>Drag pictures onto it from another folder, or drop files here to upload straight in.</span>`;
}

/** The subfolders of wherever we are, as tiles above the pictures. */
function paintFolders() {
  const host = document.querySelector('[data-lib-folders]');

  const kids = term || scope === 'all'
    ? []
    : scope === 'root'
      ? tree.roots
      : tree.byId.get(scope)?.children ?? [];

  host.hidden = !kids.length;
  host.innerHTML = kids.map(folderTile).join('');
}

function folderTile(f) {
  const deeper = f.imagesDeep - f.images;

  return `
    <div class="mfold" data-drop="${f.id}" draggable="true" data-drag-folder="${f.id}"
         ${f.color ? `data-c="${f.color}"` : ''}>
      <button type="button" class="mfold__open" data-go="${f.id}">
        ${folderIcon()}
        <span class="mfold__name">${escapeHtml(f.name)}</span>
        <small class="mfold__count">${
          f.images ? `${f.images} image${f.images === 1 ? '' : 's'}` : 'empty'
        }${deeper > 0 ? ` · ${deeper} deeper` : ''}</small>
      </button>
      <button type="button" class="mfold__more" data-menu="${f.id}"
              aria-label="Actions for ${escapeHtml(f.name)}">&#8942;</button>
    </div>`;
}

/** Where an image is filed — shown only where that is not already obvious. */
function filedIn(a) {
  if (!(term || deep || scope === 'all') || !a.folderId) return '';

  const f = tree.byId.get(a.folderId);
  if (!f) return '';

  return `<span class="mlib__where"${f.color ? ` data-c="${f.color}"` : ''}>${folderIcon()}${escapeHtml(f.name)}</span>`;
}

function card(a) {
  const on = selected.has(a.id);

  return `
    <figure class="mlib__item${on ? ' is-picked' : ''}" data-item="${a.id}"
            draggable="true" data-drag-asset="${a.id}">
      <div class="mlib__pic" data-open="${a.id}" title="Open details">
        <img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.alt || '')}" loading="lazy" draggable="false">
        ${a.usedBy ? `<span class="mtile__used" title="Used in ${a.usedBy} place(s)">${a.usedBy}</span>` : ''}
        ${a.alt ? '' : '<span class="mlib__noalt" title="No description written">alt</span>'}
        <label class="mlib__sel" title="Select (shift-click for a range)">
          <input type="checkbox" data-sel="${a.id}" ${on ? 'checked' : ''}>
          <span class="sr-only">Select ${escapeHtml(a.name)}</span>
        </label>
        <span class="mlib__zoom" aria-hidden="true">View</span>
      </div>

      <figcaption class="mlib__meta">
        <span class="mlib__name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
        <span class="mlib__dims">${a.width}&times;${a.height} · ${bytes(a.bytes)}</span>
        ${filedIn(a)}
      </figcaption>

      <!-- Alt text is a plain field on the card rather than behind an edit
           mode. It is the only accessibility work this panel asks for, and
           anything that takes two clicks to reach does not get written. -->
      <input class="input-gr mlib__alt" type="text" data-alt="${a.id}" draggable="false"
             value="${escapeHtml(a.alt || '')}"
             placeholder="Describe this image">
    </figure>`;
}

function listRow(a) {
  const on = selected.has(a.id);

  return `
    <div class="mlist__row${on ? ' is-picked' : ''}" data-item="${a.id}"
         draggable="true" data-drag-asset="${a.id}">
      <label class="mlist__sel">
        <input type="checkbox" data-sel="${a.id}" ${on ? 'checked' : ''}>
        <span class="sr-only">Select ${escapeHtml(a.name)}</span>
      </label>

      <button type="button" class="mlist__thumb" data-open="${a.id}" aria-label="Open ${escapeHtml(a.name)}">
        <img src="${escapeHtml(a.url)}" alt="" loading="lazy" draggable="false">
      </button>

      <button type="button" class="mlist__name" data-open="${a.id}">
        <strong>${escapeHtml(a.name)}</strong>
        <small>${a.alt ? escapeHtml(a.alt) : 'No description yet'}</small>
      </button>

      <span class="mlist__col">${a.width}&times;${a.height}</span>
      <span class="mlist__col">${bytes(a.bytes)}</span>
      <span class="mlist__col">${a.folderId ? escapeHtml(tree.byId.get(a.folderId)?.name ?? '—') : 'Top level'}</span>
      <span class="mlist__col">${a.usedBy ? `${a.usedBy} place${a.usedBy === 1 ? '' : 's'}` : '—'}</span>

      <button type="button" class="mbtn mbtn--quiet mlist__del" data-del="${a.id}">Delete</button>
    </div>`;
}

function bytes(n) {
  return n > 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;
}

/* ------------------------------------------------------------------ *
 * The detail drawer
 * ------------------------------------------------------------------ */

function show(id) {
  const asset = items.find((a) => a.id === id);
  if (!asset) return;

  openDrawer(asset, {
    folderName: asset.folderId ? tree.byId.get(asset.folderId)?.name : null,
    onAlt: (a, alt) => saveAlt(a.id, alt),
    onMove: async (a) => {
      const answer = await chooseFolder({
        title: `Move "${a.name}"`,
        tree,
        current: a.folderId ?? null,
      });

      if (answer) fileImages([a.id], answer.id);
    },
    onDelete: (a) => { closeDrawer(); remove(a.id); },
    onStep: async (delta) => {
      const at = items.findIndex((a) => a.id === id);
      if (at + delta < 0) return;

      // Walking off the end loads the next page rather than stopping dead —
      // the drawer is how a folder gets audited, and stopping at 48 makes it
      // useless for exactly the folders that need auditing.
      if (at + delta >= items.length && page < pages) await load(page + 1);

      const next = items[at + delta];
      if (next) show(next.id);
    },
  });
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

function pickOne(id, on, event) {
  if (event?.shiftKey && anchor != null) return extendTo(id);

  on ? selected.add(id) : selected.delete(id);
  anchor = on ? id : null;

  markPicked(id, on);
  paintBulk();
}

/** Shift-click: everything between the last click and this one. */
function extendTo(id) {
  const from = items.findIndex((a) => a.id === anchor);
  const to = items.findIndex((a) => a.id === id);

  if (from === -1 || to === -1) return pickOne(id, true);

  const [lo, hi] = from < to ? [from, to] : [to, from];

  for (let i = lo; i <= hi; i += 1) {
    selected.add(items[i].id);
    markPicked(items[i].id, true);
  }

  paintBulk();
}

function markPicked(id, on) {
  const el = document.querySelector(`[data-item="${id}"]`);

  el?.classList.toggle('is-picked', on);

  const box = el?.querySelector('[data-sel]');
  if (box) box.checked = on;
}

function selectAll() {
  items.forEach((a) => {
    selected.add(a.id);
    markPicked(a.id, true);
  });

  paintBulk();

  if (page < pages) {
    toast(`${selected.size} selected — the ones loaded so far. Scroll on to reach the rest.`, { tone: 'info' });
  }
}

function clearSelection() {
  selected.forEach((id) => markPicked(id, false));
  selected.clear();
  anchor = null;

  paintBulk();
}

function paintBulk() {
  const bar = document.querySelector('[data-lib-bulk]');

  bar.hidden = selected.size === 0;
  bar.querySelector('[data-bulk-count]').textContent =
    `${selected.size} image${selected.size === 1 ? '' : 's'} selected`;
}

async function moveSelection() {
  const answer = await chooseFolder({
    title: `Move ${selected.size} image${selected.size === 1 ? '' : 's'}`,
    tree,
    current: currentFolderId(),
  });

  if (!answer) return;

  fileImages([...selected], answer.id);
}

async function deleteSelection() {
  const ids = [...selected];

  const inUse = items.filter((a) => ids.includes(a.id) && a.usedBy).length;

  if (!await askConfirm({
    title: `Delete ${ids.length} image${ids.length === 1 ? '' : 's'}?`,
    message: inUse
      ? `${inUse} of them ${inUse === 1 ? 'is' : 'are'} still used on the shop and will be left alone. The rest are removed for good — this cannot be undone.`
      : 'They are removed from the library for good. This cannot be undone.',
    confirm: `Delete ${ids.length}`,
  })) return;

  let res;
  try {
    res = await adminFetch('/media/delete-many', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch (err) {
    return toast(err.message, { tone: 'bad' });
  }

  clearSelection();
  await refreshTree();
  await load(1);

  toast(res.message, { tone: res.skipped ? 'info' : 'ok' });
}

/**
 * The one place images change folder. Drag, the bulk bar and the drawer all
 * land here so they cannot drift apart in what they refresh — or in whether
 * they offer the move back.
 */
async function fileImages(ids, folderId, undoing = false) {
  // Captured BEFORE the move, because after it the server's answer is the new
  // folder and the old one is gone. Undo restores each image to where it
  // actually was, not to wherever the majority came from.
  const before = new Map(
    items.filter((a) => ids.includes(a.id)).map((a) => [a.id, a.folderId ?? null])
  );

  let res;
  try {
    res = await moveAssets(ids, folderId);
  } catch (err) {
    return toast(err.message, { tone: 'bad' });
  }

  clearSelection();
  await refreshTree();
  await load(1);

  if (undoing) return toast('Move undone.');

  toast(res.message, {
    action: before.size ? {
      label: 'Undo',
      run: async () => {
        // Group by where each one came from: a selection dragged out of three
        // folders goes back to three folders, not to whichever one happened
        // to be first.
        const groups = new Map();

        before.forEach((was, id) => {
          if (!groups.has(was)) groups.set(was, []);
          groups.get(was).push(id);
        });

        for (const [was, group] of groups) {
          await moveAssets(group, was);
        }

        await refreshTree();
        await load(1);
        toast('Move undone.');
      },
    } : null,
  });
}

/* ------------------------------------------------------------------ *
 * Drag and drop — images and folders
 * ------------------------------------------------------------------ */

function onDragStart(e) {
  // Selecting text in the alt-text field would otherwise start dragging the
  // card the field sits on, which makes the one field on this screen that
  // needs typing the one field you cannot edit with a mouse.
  if (e.target.closest('input, textarea')) {
    e.preventDefault();
    return;
  }

  const card = e.target.closest('[data-drag-asset]');

  if (card) {
    const id = Number(card.dataset.dragAsset);

    // Dragging one of several selected images drags the whole selection —
    // dragging an unselected one drags just it, and does not quietly discard
    // the selection someone spent a minute building.
    dragging = { kind: 'assets', ids: selected.has(id) ? [...selected] : [id] };

    ghost(e, dragging.ids.length > 1
      ? `${dragging.ids.length} images`
      : card.querySelector('.mlib__name, .mlist__name strong')?.textContent ?? 'image');
  } else {
    const folderEl = e.target.closest('[data-drag-folder]');
    if (!folderEl) return;

    dragging = { kind: 'folder', id: Number(folderEl.dataset.dragFolder) };
    ghost(e, folderEl.querySelector('.mtree__label span, .mfold__name')?.textContent ?? 'folder');
  }

  document.body.classList.add('is-dragging-media');

  // Firefox refuses to start a drag at all unless something is set here, even
  // though the payload lives in `dragging` for the reason at its declaration.
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragging.kind);
}

/**
 * A tidy label under the cursor instead of a ghost of the whole card.
 *
 * The browser's default drag image for a grid cell is a translucent copy of
 * the card, alt-text field and all, which covers the folder you are trying to
 * aim at. Dragging forty images shows one chip that says "40 images".
 */
function ghost(e, label) {
  const chip = document.createElement('div');
  chip.className = 'mdragchip';
  chip.textContent = label;
  document.body.append(chip);

  e.dataTransfer.setDragImage(chip, 12, 12);

  // Removed on the next frame: setDragImage has already snapshotted it, and
  // leaving it in the document would pile up one chip per drag.
  requestAnimationFrame(() => chip.remove());
}

function onDragEnd() {
  dragging = null;
  document.body.classList.remove('is-dragging-media');
  document.querySelectorAll('.is-drop').forEach((el) => el.classList.remove('is-drop'));
}

/** Null when this target would be an illegal drop, so nothing lights up. */
function targetOf(e) {
  const host = e.target.closest('[data-drop]');
  if (!host || !dragging) return null;

  const key = host.dataset.drop;
  const id = key === 'root' ? null : Number(key);

  if (dragging.kind === 'folder') {
    if (id === dragging.id) return null;                                    // into itself
    if (id != null && subtreeIds(tree, dragging.id).has(id)) return null;   // into its own child
    if (id === (tree.byId.get(dragging.id)?.parentId ?? null)) return null; // already there
  }

  return { host, id };
}

function onDragOver(e) {
  if (isFileDrag(e)) return;   // desktop files are handled by onFileOver

  const target = targetOf(e);
  if (!target) return;

  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  target.host.classList.add('is-drop');
}

function onDragLeave(e) {
  e.target.closest('[data-drop]')?.classList.remove('is-drop');
}

function onDrop(e) {
  if (isFileDrag(e)) return;

  const target = targetOf(e);
  if (!target) return;

  e.preventDefault();
  e.stopPropagation();
  target.host.classList.remove('is-drop');

  const payload = dragging;
  onDragEnd();

  if (payload.kind === 'assets') {
    fileImages(payload.ids, target.id);
  } else {
    applyFolderMove(payload.id, target.id, tree.byId.get(payload.id)?.parentId ?? null);
  }
}

/* ------------------------------------------------------------------ *
 * Drag and drop — files from the desktop
 *
 * Dropping onto a folder uploads into it; dropping anywhere else uploads into
 * whatever folder is open. Both beat the alternative, which is that the
 * browser navigates away to the JPEG.
 * ------------------------------------------------------------------ */

function onFileOver(e) {
  if (!isFileDrag(e)) return;

  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';

  document.querySelector('.mfm').classList.add('is-file-over');

  const host = e.target.closest('[data-drop]');

  document.querySelectorAll('.is-drop').forEach((el) => {
    if (el !== host) el.classList.remove('is-drop');
  });

  host?.classList.add('is-drop');
}

function onFileLeave(e) {
  const mfm = document.querySelector('.mfm');

  // relatedTarget is where the cursor went. Only a departure from the whole
  // pane counts — without this the hint flickers off every time the cursor
  // crosses from one card to the next.
  if (!mfm.contains(e.relatedTarget)) clearFileHint();
}

function clearFileHint() {
  document.querySelector('.mfm')?.classList.remove('is-file-over');
  document.querySelectorAll('.is-drop').forEach((el) => el.classList.remove('is-drop'));
}

async function onFileDrop(e) {
  if (!isFileDrag(e)) return;

  e.preventDefault();

  const host = e.target.closest('[data-drop]');
  const into = host
    ? (host.dataset.drop === 'root' ? null : Number(host.dataset.drop))
    : currentFolderId();

  clearFileHint();

  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;

  const res = await uploadFiles(files, {
    folderId: into,
    queue: document.querySelector('[data-lib-queue]'),
  });

  await refreshTree();
  await load(1);

  if (res.ok) {
    toast(`${res.ok} image${res.ok === 1 ? '' : 's'} uploaded to ${folderName(into)}.`);
  }

  if (res.skipped) {
    toast(`${res.skipped} file${res.skipped === 1 ? '' : 's'} skipped — only images can go in the library.`, { tone: 'info' });
  }

  if (res.failed) {
    toast(`${res.failed} upload${res.failed === 1 ? '' : 's'} failed. The rows above say why.`, { tone: 'bad' });
  }
}

/* ------------------------------------------------------------------ *
 * Alt text and delete
 * ------------------------------------------------------------------ */

async function saveAlt(id, value, input = null) {
  const record = items.find((a) => String(a.id) === String(id));

  if (record && (record.alt || '') === value) return;   // nothing changed

  try {
    await adminFetch(`/media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt: value || null }),
    });
  } catch (err) {
    if (input) input.value = record?.alt || '';
    return toast(err.message, { tone: 'bad' });
  }

  if (record) {
    record.alt = value || null;
    refreshDrawer(record);

    // The "alt" badge on the card has to go the moment the text exists,
    // without repainting the grid out from under a cursor mid-edit.
    document.querySelector(`[data-item="${id}"] .mlib__noalt`)?.remove();
  }

  toast('Description saved.');
}

async function remove(id) {
  const record = items.find((a) => a.id === Number(id));

  if (!await askConfirm({
    title: `Delete "${record?.name ?? 'this image'}"?`,
    message: 'The file is removed from the library and from anywhere on the shop that shows it. This cannot be undone.',
    confirm: 'Delete image',
  })) return;

  try {
    await adminFetch(`/media/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (err.status === 409) {
      // The server refused because it is still in use, and its message says
      // where. Re-sending with ?force is the merchant choosing to break
      // something, which deserves its own question.
      if (!await askConfirm({
        title: 'This image is in use',
        message: err.message,
        confirm: 'Delete anyway',
      })) return;

      try {
        await adminFetch(`/media/${id}?force=1`, { method: 'DELETE' });
      } catch (forced) {
        return toast(forced.message, { tone: 'bad' });
      }
    } else {
      return toast(err.message, { tone: 'bad' });
    }
  }

  items = items.filter((a) => a.id !== Number(id));
  selected.delete(Number(id));
  shown = Math.max(0, shown - 1);

  closeDrawer();
  await refreshTree();
  paintCount();
  paint();
  toast('Image deleted.');
}
