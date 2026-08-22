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
 * everything else. This screen says so out loud, once, in the card at the top,
 * because a merchant who is not sure whether reorganising is safe simply never
 * reorganises.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not reimplement uploading or
 * searching the library — the picker sheet already does both, and "Upload
 * images" opens that same sheet, into the folder currently open. What this
 * screen adds is everything the picker refuses to offer because it is used
 * mid-task: writing alt text, deleting, and reorganising.
 */

import { adminFetch } from '/modules/admin/backend/api.js';
import { escapeHtml } from '/modules/admin/admin-shell.js';
import { pickImage } from './media-picker.js';
import {
  askConfirm,
  askText,
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

/** Where the screen was last left, so a reload does not start over at the top. */
const REMEMBER = 'gr:media-scope';

let tree = { list: [], byId: new Map(), roots: [], unfiled: 0, total: 0 };

/** 'all' | 'root' | a folder id. Never a folder object — ids survive a reload. */
let scope = 'root';
let deep = false;
let term = '';

let items = [];
let page = 1;
let pages = 1;
let shown = 0;

const selected = new Set();
const expanded = new Set();

/** What is under the cursor mid-drag. A module variable, not dataTransfer:
 *  Safari will not let you READ dataTransfer during dragover, which is exactly
 *  when a drop target has to decide whether it is a legal target. */
let dragging = null;

document.addEventListener('admin:ready', init);

async function init() {
  if (!document.querySelector('[data-lib-grid]')) return;

  restore();
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

  document.querySelector('[data-lib-more]')?.addEventListener('click', () => load(page + 1));

  document.querySelector('[data-bulk-clear]')?.addEventListener('click', clearSelection);
  document.querySelector('[data-bulk-move]')?.addEventListener('click', moveSelection);

  /* --- the tree ------------------------------------------------------ */

  treeEl.addEventListener('click', (e) => {
    const twist = e.target.closest('[data-twist]');
    if (twist) {
      const id = Number(twist.dataset.twist);
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
      return paintTree();
    }

    const menu = e.target.closest('[data-menu]');
    if (menu) return openMenu(menu, Number(menu.dataset.menu));

    const go = e.target.closest('[data-go]');
    if (go) return goTo(go.dataset.go);
  });

  /* --- crumbs and folder tiles --------------------------------------- */

  document.querySelector('[data-lib-crumbs]').addEventListener('click', (e) => {
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
    if (box) toggleSelected(Number(box.dataset.sel), box.checked);
  });

  gridEl.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) remove(del.dataset.del);
  });

  gridEl.addEventListener('blur', (e) => {
    // Save on blur, not on every keystroke: alt text is a sentence, and a
    // request per character would be both wasteful and jumpy on mobile data.
    if (e.target.matches('[data-alt]')) saveAlt(e.target);
  }, true);

  gridEl.addEventListener('keydown', (e) => {
    if (e.target.matches('[data-alt]') && e.key === 'Enter') e.target.blur();
  });

  /* --- drag and drop -------------------------------------------------- */

  [gridEl, foldersEl, treeEl].forEach((host) => {
    host.addEventListener('dragstart', onDragStart);
    host.addEventListener('dragend', onDragEnd);
  });

  [foldersEl, treeEl, document.querySelector('[data-lib-crumbs]')].forEach((host) => {
    host.addEventListener('dragover', onDragOver);
    host.addEventListener('dragleave', onDragLeave);
    host.addEventListener('drop', onDrop);
  });
}

/* ------------------------------------------------------------------ *
 * Where we are
 * ------------------------------------------------------------------ */

/** The folder id in play, or null for the top level / everything. */
function currentFolderId() {
  return typeof scope === 'number' ? scope : null;
}

function goTo(next) {
  scope = next === 'all' || next === 'root' ? next : Number(next);
  deep = false;
  clearSelection();
  remember();

  // Opening a folder opens its ancestors, so the sidebar always shows where
  // you are rather than making you find it again.
  trail(tree, currentFolderId()).forEach((c) => expanded.add(c.id));

  paintTree();
  load(1);
}

function restore() {
  try {
    const saved = localStorage.getItem(REMEMBER);
    if (saved) scope = saved === 'all' || saved === 'root' ? saved : Number(saved);
  } catch { /* private mode — start at the top level */ }
}

function remember() {
  try { localStorage.setItem(REMEMBER, String(scope)); } catch { /* fine */ }
}

/* ------------------------------------------------------------------ *
 * The tree
 * ------------------------------------------------------------------ */

async function refreshTree() {
  try {
    tree = await fetchTree();
  } catch (err) {
    document.querySelector('[data-lib-tree]').innerHTML =
      `<p class="admin__sub" style="padding:var(--space-3)">${escapeHtml(err.message)}</p>`;
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
    ${row({ key: 'all', label: 'All images', count: tree.total, icon: stackIcon(), drop: false })}
    ${row({ key: 'root', label: 'Top level', count: tree.unfiled, icon: homeIcon(), drop: true })}
    <div class="mtree__kids">${tree.roots.map((f) => branch(f)).join('')}</div>
    ${tree.roots.length ? '' : '<p class="mtree__empty">No folders yet. Make one and drag pictures into it.</p>'}`;

  paintCrumbs();
}

function row({ key, label, count, icon, drop }) {
  const on = String(scope) === String(key);

  return `
    <div class="mtree__row${on ? ' is-on' : ''}"${drop ? ` data-drop="${key}"` : ''}>
      <span class="mtree__twist" aria-hidden="true"></span>
      <button type="button" class="mtree__label" data-go="${key}">
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
           draggable="true" data-drag-folder="${folder.id}">
        ${kids.length
          ? `<button type="button" class="mtree__twist${open ? ' is-open' : ''}" data-twist="${folder.id}"
                     aria-label="${open ? 'Collapse' : 'Expand'} ${escapeHtml(folder.name)}"
                     aria-expanded="${open}">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 6 6 6-6 6"/></svg>
             </button>`
          : '<span class="mtree__twist" aria-hidden="true"></span>'}

        <button type="button" class="mtree__label" data-go="${folder.id}" title="${escapeHtml(folder.name)}">
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
      `<button type="button" class="mfm__crumb" data-go="root" data-drop="root">Top level</button>`,
      ...parts.map((c, i) => {
        const last = i === parts.length - 1;
        return last
          ? `<span class="mfm__crumb is-now">${escapeHtml(c.name)}</span>`
          : `<button type="button" class="mfm__crumb" data-go="${c.id}" data-drop="${c.id}">${escapeHtml(c.name)}</button>`;
      }),
    ].join('<span class="mfm__sep" aria-hidden="true">/</span>');
  }

  const wrap = document.querySelector('[data-lib-deep-wrap]');
  wrap.hidden = typeof scope !== 'number' || !!term;
  document.querySelector('[data-lib-deep]').checked = deep;
}

/* ------------------------------------------------------------------ *
 * Folder actions
 * ------------------------------------------------------------------ */

async function newFolder(parentId) {
  const parent = parentId != null ? tree.byId.get(parentId) : null;

  const name = await askText({
    title: parent ? `New folder in "${parent.name}"` : 'New top-level folder',
    label: 'Folder name',
    confirm: 'Create folder',
  });

  if (!name) return;

  try {
    const res = await createFolder(name, parentId);
    await refreshTree();
    if (parentId != null) expanded.add(parentId);
    goTo(String(res.data.id));
    note(`Folder "${name}" created.`, true);
  } catch (err) {
    note(err.message, false);
  }
}

async function renameFolder(id) {
  const folder = tree.byId.get(id);
  if (!folder) return;

  const name = await askText({
    title: 'Rename folder',
    label: 'Folder name',
    value: folder.name,
    confirm: 'Rename',
  });

  if (!name || name === folder.name) return;

  try {
    await patchFolder(id, { name });
    await refreshTree();
    paint();
    note('Folder renamed.', true);
  } catch (err) {
    note(err.message, false);
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

  await applyFolderMove(id, answer.id);
}

async function applyFolderMove(id, parentId) {
  try {
    await patchFolder(id, { parentId });
    await refreshTree();
    if (parentId != null) expanded.add(parentId);
    paintTree();
    paint();
    note('Folder moved.', true);
  } catch (err) {
    note(err.message, false);
  }
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
    if (err.status !== 409) return note(err.message, false);

    if (!await askConfirm({
      title: 'That folder is not empty',
      message: err.message,
      confirm: 'Delete anyway',
    })) return;

    try {
      await deleteFolder(id, true);
    } catch (forced) {
      return note(forced.message, false);
    }
  }

  // Standing where a folder used to be is a blank screen with no explanation,
  // so step up to the parent.
  if (scope === id) scope = folder.parentId ?? 'root';

  expanded.delete(id);
  await refreshTree();
  remember();
  load(1);
  note('Folder deleted.', true);
}

/** The ⋯ menu on a folder row. Built on demand, removed on any click away. */
function openMenu(anchor, id) {
  document.querySelector('.mmenu')?.remove();

  const menu = document.createElement('div');
  menu.className = 'mmenu';
  menu.innerHTML = `
    <button type="button" data-act="new">New subfolder</button>
    <button type="button" data-act="rename">Rename</button>
    <button type="button" data-act="move">Move to…</button>
    <button type="button" data-act="delete" class="is-danger">Delete</button>`;

  const box = anchor.getBoundingClientRect();
  menu.style.top = `${box.bottom + window.scrollY + 4}px`;
  menu.style.left = `${Math.min(box.left + window.scrollX, window.innerWidth - 190)}px`;

  document.body.append(menu);

  menu.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    menu.remove();

    if (act === 'new') newFolder(id);
    if (act === 'rename') renameFolder(id);
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
 * Images
 * ------------------------------------------------------------------ */

async function load(next) {
  const grid = document.querySelector('[data-lib-grid]');
  if (next === 1) grid.innerHTML = '<p class="admin__sub">Loading images…</p>';

  // Searching is always across the whole library. Someone typing a file name
  // is trying to FIND a picture, and a search that silently only looks in the
  // folder you happen to be standing in answers "no such image" for one that
  // is plainly there.
  const where = term ? 'all' : scope;

  let res;
  try {
    const q = term ? `&q=${encodeURIComponent(term)}` : '';
    const d = deep && typeof where === 'number' ? '&deep=1' : '';
    res = await adminFetch(`/media?folder=${where}&page=${next}&perPage=48${q}${d}`);
  } catch (err) {
    grid.innerHTML = `<p class="admin__sub">${escapeHtml(err.message)}</p>`;
    return;
  }

  page = res.meta.page;
  pages = res.meta.pages;
  shown = res.meta.total;
  items = next === 1 ? res.data : [...items, ...res.data];

  paintCount();
  paint();
}

function paintCount() {
  const here = shown === 1 ? '1 image' : `${shown} images`;

  const label = term
    ? `${here} matching "${term}"`
    : scope === 'all'
      ? here
      : scope === 'root'
        ? `${here} at the top level · ${tree.total} in the library`
        : `${here} in "${tree.byId.get(scope)?.name ?? ''}"${deep ? ' and its subfolders' : ''} · ${tree.total} in the library`;

  document.querySelector('[data-lib-count]').textContent = shown === 0 && !term
    ? (scope === 'all' ? 'No images yet' : 'This folder is empty')
    : label;
}

function paint() {
  paintCrumbs();
  paintFolders();

  const grid = document.querySelector('[data-lib-grid]');

  grid.innerHTML = items.length
    ? items.map(cell).join('')
    : `<p class="admin__sub">${emptyLine()}</p>`;

  document.querySelector('[data-lib-more]').hidden = page >= pages;
  paintBulk();
}

function emptyLine() {
  if (term) return 'Nothing matches that.';
  if (scope === 'all') return 'No images yet — upload your first one.';
  if (scope === 'root') return 'Nothing filed at the top level.';
  return 'This folder has no images yet. Drag some in, or upload straight into it.';
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
  host.innerHTML = kids.map(tile).join('');
}

function tile(f) {
  const deepExtra = f.imagesDeep - f.images;

  return `
    <div class="mfold" data-drop="${f.id}" draggable="true" data-drag-folder="${f.id}">
      <button type="button" class="mfold__open" data-go="${f.id}">
        ${folderIcon()}
        <span class="mfold__name">${escapeHtml(f.name)}</span>
        <small class="mfold__count">${
          f.images ? `${f.images} image${f.images === 1 ? '' : 's'}` : 'empty'
        }${deepExtra > 0 ? ` · ${deepExtra} in subfolders` : ''}</small>
      </button>
      <button type="button" class="mfold__more" data-menu="${f.id}"
              aria-label="Actions for ${escapeHtml(f.name)}">&#8942;</button>
    </div>`;
}

function cell(a) {
  const kb = a.bytes > 1024 * 1024
    ? `${(a.bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(a.bytes / 1024)} KB`;

  // Where it is filed, shown only when the answer is not already obvious from
  // the folder you are standing in — searching and "include subfolders" are
  // exactly the two views where it stops being obvious.
  const filed = (term || deep || scope === 'all') && a.folderId
    ? `<span class="mlib__where">${folderIcon()}${escapeHtml(tree.byId.get(a.folderId)?.name ?? '')}</span>`
    : '';

  const on = selected.has(a.id);

  return `
    <figure class="mlib__item${on ? ' is-picked' : ''}" data-item="${a.id}"
            draggable="true" data-drag-asset="${a.id}">
      <div class="mlib__pic">
        <img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.alt || '')}" loading="lazy" draggable="false">
        ${a.usedBy ? `<span class="mtile__used" title="Used in ${a.usedBy} place(s)">${a.usedBy}</span>` : ''}
        <label class="mlib__sel" title="Select">
          <input type="checkbox" data-sel="${a.id}" ${on ? 'checked' : ''}>
          <span class="sr-only">Select ${escapeHtml(a.name)}</span>
        </label>
      </div>
      <figcaption class="mlib__meta">
        <span class="mlib__name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
        <span class="mlib__dims">${a.width}&times;${a.height} · ${kb}</span>
        ${filed}
      </figcaption>

      <!-- Alt text is a plain field on the card rather than behind an edit
           mode. It is the only accessibility work this panel asks for, and
           anything that takes two clicks to reach does not get written. -->
      <input class="input-gr mlib__alt" type="text" data-alt="${a.id}"
             value="${escapeHtml(a.alt || '')}" draggable="false"
             placeholder="Describe this image">

      <button type="button" class="mbtn mbtn--quiet mlib__del" data-del="${a.id}">Delete</button>
    </figure>`;
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

function toggleSelected(id, on) {
  on ? selected.add(id) : selected.delete(id);

  document.querySelector(`[data-item="${id}"]`)?.classList.toggle('is-picked', on);
  paintBulk();
}

function clearSelection() {
  selected.clear();

  document.querySelectorAll('[data-sel]').forEach((box) => { box.checked = false; });
  document.querySelectorAll('.mlib__item.is-picked').forEach((el) => el.classList.remove('is-picked'));

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

  await fileImages([...selected], answer.id);
}

/**
 * The one place images change folder. Drag and the bulk bar both land here so
 * they cannot drift apart in what they refresh afterwards.
 */
async function fileImages(ids, folderId) {
  let res;
  try {
    res = await moveAssets(ids, folderId);
  } catch (err) {
    return note(err.message, false);
  }

  clearSelection();
  await refreshTree();
  await load(1);
  note(res.message, true);
}

/* ------------------------------------------------------------------ *
 * Drag and drop
 *
 * Dragging is the fast path, never the only path: every move here is also
 * reachable from the "Move to folder…" button and the ⋯ menu, because a drag
 * is hard on a touch screen and impossible from a keyboard.
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
  } else {
    const folderEl = e.target.closest('[data-drag-folder]');
    if (!folderEl) return;

    dragging = { kind: 'folder', id: Number(folderEl.dataset.dragFolder) };
  }

  document.body.classList.add('is-dragging-media');

  // Firefox refuses to start a drag at all unless something is set here, even
  // though the payload lives in `dragging` for the reason at its declaration.
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragging.kind);
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
    if (id === dragging.id) return null;                       // into itself
    if (id != null && subtreeIds(tree, dragging.id).has(id)) return null;  // into its own child
    if (id === (tree.byId.get(dragging.id)?.parentId ?? null)) return null; // already there
  }

  return { host, id };
}

function onDragOver(e) {
  const target = targetOf(e);
  if (!target) return;

  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  target.host.classList.add('is-drop');
}

function onDragLeave(e) {
  e.target.closest('[data-drop]')?.classList.remove('is-drop');
}

function onDrop(e) {
  const target = targetOf(e);
  if (!target) return;

  e.preventDefault();
  target.host.classList.remove('is-drop');

  const payload = dragging;
  onDragEnd();

  if (payload.kind === 'assets') fileImages(payload.ids, target.id);
  else applyFolderMove(payload.id, target.id);
}

/* ------------------------------------------------------------------ *
 * Alt text and delete — unchanged behaviour, folder-aware refresh
 * ------------------------------------------------------------------ */

async function saveAlt(input) {
  const id = input.dataset.alt;
  const record = items.find((a) => String(a.id) === id);
  const value = input.value.trim();

  if (record && (record.alt || '') === value) return;   // nothing changed

  try {
    await adminFetch(`/media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt: value || null }),
    });
  } catch (err) {
    input.value = record?.alt || '';
    return note(err.message, false);
  }

  if (record) record.alt = value || null;
  note('Description saved.', true);
}

async function remove(id) {
  const record = items.find((a) => String(a.id) === id);

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
        return note(forced.message, false);
      }
    } else {
      return note(err.message, false);
    }
  }

  items = items.filter((a) => String(a.id) !== id);
  selected.delete(Number(id));
  shown = Math.max(0, shown - 1);

  await refreshTree();
  paintCount();
  paint();
  note('Image deleted.', true);
}

function note(message, ok) {
  const el = document.querySelector('[data-lib-note]');

  el.textContent = message;
  el.hidden = false;
  el.style.background = ok ? 'rgba(46,160,67,.10)' : '';
  el.style.color = ok ? '#1a7f37' : '';

  clearTimeout(note.timer);
  note.timer = setTimeout(() => { el.hidden = true; }, 6000);
}
