/**
 * folders.js — the folder tree, and the two dialogs that edit it.
 *
 * Shared by the Images screen and the picker sheet, because both have to draw
 * the same tree and neither should own it. A folder shown one way in the panel
 * and another way in the picker is two mental models of one thing, and the
 * merchant has to hold both.
 *
 * A static import is right here: this file and its two consumers are the same
 * module. The rule about dynamic imports applies ACROSS modules — a product
 * screen reaching for the picker — and exists so removing modules/media cannot
 * break a screen that merely uses images. Inside the folder, a static import
 * is honest about the fact that these files ship together or not at all.
 */

import { adminFetch } from '/modules/admin/backend/api.js';

/** The top level. Not a folder row — the absence of one. */
export const TOP = null;

/* ------------------------------------------------------------------ *
 * Reading the tree
 * ------------------------------------------------------------------ */

/**
 * Fetch the whole tree in one request.
 *
 * The whole tree, not a page: folders are tens, not thousands, and a sidebar
 * that pages is not a sidebar. The server returns them ordered by path, so a
 * parent is always seen before its children and the index below is one pass.
 *
 * @returns {Promise<{list: Array, byId: Map, unfiled: number, total: number}>}
 */
export async function fetchTree() {
  const res = await adminFetch('/media/folders');
  return index(res.data, res.meta);
}

/** Turn the flat, path-ordered list into something a tree can be drawn from. */
export function index(list, meta = {}) {
  const byId = new Map();
  const roots = [];

  list.forEach((f) => byId.set(f.id, { ...f, children: [] }));

  byId.forEach((f) => {
    const parent = f.parentId != null ? byId.get(f.parentId) : null;
    (parent ? parent.children : roots).push(f);
  });

  return {
    list,
    byId,
    roots,
    unfiled: meta.unfiled ?? 0,
    total: meta.total ?? 0,
    maxDepth: meta.maxDepth ?? 5,
  };
}

/**
 * The trail from the top level down to (and including) a folder.
 *
 * @returns {Array<{id:number,name:string}>} empty at the top level
 */
export function trail(tree, id) {
  const out = [];

  let node = id != null ? tree.byId.get(id) : null;

  while (node) {
    out.unshift({ id: node.id, name: node.name });
    node = node.parentId != null ? tree.byId.get(node.parentId) : null;
  }

  return out;
}

/** Every folder under `id`, itself included — what a move must not target. */
export function subtreeIds(tree, id) {
  const out = new Set();

  const walk = (node) => {
    out.add(node.id);
    node.children.forEach(walk);
  };

  const start = tree.byId.get(id);
  if (start) walk(start);

  return out;
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

export function createFolder({ name, color = null, parentId = null }) {
  return adminFetch('/media/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color, parentId }),
  });
}

export function patchFolder(id, changes) {
  return adminFetch(`/media/folders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

export function deleteFolder(id, force = false) {
  return adminFetch(`/media/folders/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' });
}

/** File images. `folderId` of null means the top level. */
export function moveAssets(ids, folderId) {
  return adminFetch('/media/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, folderId: folderId ?? null }),
  });
}

/* ------------------------------------------------------------------ *
 * Dialogs
 *
 * Not window.prompt and not window.confirm. Both of them look like the browser
 * warning you about something, which is the wrong tone for naming a folder,
 * and neither can be styled, so on a phone they are a system sheet dropped on
 * top of a panel that has spent some effort on looking like itself.
 * ------------------------------------------------------------------ */

/**
 * The palette, mirrored from MediaFolder::COLORS.
 *
 * Mirrored and not fetched, because the swatches have to paint before the
 * first request comes back. The server is still the authority: it drops a
 * token it does not recognise rather than trusting this list.
 */
export const COLORS = ['amber', 'rose', 'violet', 'sky', 'emerald', 'teal', 'slate'];

/**
 * Name a folder and give it a colour. Resolves `{name, color}` or null.
 *
 * One dialog for both create and rename, because they ask the same question
 * and a merchant who learned the colour swatches while creating should not
 * have to go looking for them again to change one.
 *
 * @param {{title:string, name?:string, color?:string|null, confirm?:string}} opts
 */
export function askFolder({ title, name = '', color = null, confirm = 'Save' }) {
  let picked = color;

  return dialog({
    title,
    body: `
      <label class="mdlg__field">
        <span>Folder name</span>
        <input class="input-gr" type="text" data-input value="${escape(name)}"
               maxlength="80" autocomplete="off" spellcheck="false"
               placeholder="Ramadan 2026">
      </label>

      <div class="mdlg__field">
        <span>Colour <small>optional</small></span>
        <div class="mswatches" data-swatches>
          <button type="button" class="mswatch is-none" data-color="" title="No colour"
                  aria-label="No colour"></button>
          ${COLORS.map((c) => `
            <button type="button" class="mswatch" data-color="${c}" data-c="${c}"
                    title="${c}" aria-label="${c}"></button>`).join('')}
        </div>
      </div>`,
    confirm,
    wire: (panel, done) => {
      const input = panel.querySelector('[data-input]');

      input.focus();
      input.select();

      const mark = () => panel.querySelectorAll('[data-color]').forEach((b) => {
        b.classList.toggle('is-on', (b.dataset.color || null) === picked);
      });

      panel.querySelectorAll('[data-color]').forEach((b) => {
        b.addEventListener('click', () => {
          picked = b.dataset.color || null;
          mark();
        });
      });

      mark();

      // Enter submits. A two-field dialog that needs the mouse to confirm is a
      // dialog that gets typed into and then abandoned.
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;

        e.preventDefault();
        const value = input.value.trim();
        if (value) done({ name: value, color: picked });
      });

      return () => {
        const value = input.value.trim();
        return value ? { name: value, color: picked } : null;
      };
    },
  });
}

/**
 * Pick a destination folder. Resolves with `{ id }` — id null for the top
 * level — or null if dismissed.
 *
 * @param {{title:string, tree:object, exclude?:Set<number>, current?:number|null, confirm?:string}} opts
 */
export function chooseFolder({ title, tree, exclude = new Set(), current = null, confirm = 'Move here' }) {
  let chosen = current ?? null;

  const rows = [];

  const push = (folder, depth) => {
    const blocked = exclude.has(folder.id);

    rows.push(`
      <button type="button" class="mpick__row${blocked ? ' is-blocked' : ''}"
              data-folder="${folder.id}" ${blocked ? 'disabled' : ''}
              style="--depth:${depth}"${folder.color ? ` data-c="${folder.color}"` : ''}>
        ${folderIcon()}
        <span>${escape(folder.name)}</span>
        ${folder.images ? `<small>${folder.images}</small>` : ''}
      </button>`);

    // A blocked folder still lists its children, greyed with it. Hiding the
    // subtree would make a folder someone can see in the sidebar simply not
    // exist in this list, which reads as a bug rather than as a rule.
    folder.children.forEach((child) => push(child, depth + 1));
  };

  tree.roots.forEach((f) => push(f, 0));

  return dialog({
    title,
    hint: 'Images keep the same web address wherever they are filed, so nothing on the shop changes.',
    body: `
      <div class="mpick">
        <button type="button" class="mpick__row" data-folder="" style="--depth:0">
          ${homeIcon()}
          <span>Top level</span>
        </button>
        ${rows.join('') || '<p class="mdlg__empty">No folders yet.</p>'}
      </div>`,
    confirm,
    wire: (panel, done) => {
      const mark = () => {
        panel.querySelectorAll('[data-folder]').forEach((row) => {
          const id = row.dataset.folder === '' ? null : Number(row.dataset.folder);
          row.classList.toggle('is-on', id === chosen);
        });
      };

      panel.querySelectorAll('[data-folder]').forEach((row) => {
        row.addEventListener('click', () => {
          chosen = row.dataset.folder === '' ? null : Number(row.dataset.folder);
          mark();
        });
        // Double-click confirms, the way a file manager does.
        row.addEventListener('dblclick', () => {
          chosen = row.dataset.folder === '' ? null : Number(row.dataset.folder);
          done({ id: chosen });
        });
      });

      mark();

      return () => ({ id: chosen });
    },
  });
}

/**
 * Ask a yes/no question. Resolves true or false.
 *
 * @param {{title:string, message:string, confirm?:string, danger?:boolean}} opts
 */
export async function askConfirm({ title, message, confirm = 'Delete', danger = true }) {
  const answer = await dialog({
    title,
    body: `<p class="mdlg__text">${escape(message)}</p>`,
    confirm,
    danger,
    wire: () => () => true,
  });

  return answer === true;
}

/* ------------------------------------------------------------------ *
 * The dialog shell
 * ------------------------------------------------------------------ */

function dialog({ title, body, confirm, hint = '', danger = false, wire }) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'mdlg';
    host.innerHTML = `
      <div class="mdlg__scrim" data-cancel></div>
      <div class="mdlg__panel" role="dialog" aria-modal="true" aria-label="${escape(title)}">
        <h2 class="mdlg__title">${escape(title)}</h2>
        ${hint ? `<p class="mdlg__hint">${escape(hint)}</p>` : ''}
        ${body}
        <div class="mdlg__foot">
          <button type="button" class="mbtn mbtn--quiet" data-cancel>Cancel</button>
          <button type="button" class="mbtn${danger ? ' is-danger' : ' is-primary'}" data-ok>${escape(confirm)}</button>
        </div>
      </div>`;

    document.body.append(host);
    requestAnimationFrame(() => host.classList.add('is-open'));

    let settled = false;

    const done = (value) => {
      if (settled) return;
      settled = true;

      host.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => host.remove(), 180);

      resolve(value);
    };

    // Escape closes. A dialog you cannot back out of is worse than no dialog,
    // and this one can appear over a form someone is halfway through.
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);

    const read = wire(host.querySelector('.mdlg__panel'), done);

    host.querySelectorAll('[data-cancel]').forEach((el) =>
      el.addEventListener('click', () => done(null)));

    host.querySelector('[data-ok]').addEventListener('click', () => done(read()));
  });
}

/* ------------------------------------------------------------------ *
 * Icons — inline, because two SVG requests for a sidebar is two too many
 * ------------------------------------------------------------------ */

export function folderIcon(open = false) {
  return open
    ? '<svg class="mico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1"/><path d="M3 8v10a2 2 0 0 0 2 2h13.2a2 2 0 0 0 1.9-1.4L22 11H6.6a2 2 0 0 0-1.9 1.4Z"/></svg>'
    : '<svg class="mico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
}

export function homeIcon() {
  return '<svg class="mico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z"/></svg>';
}

export function stackIcon() {
  return '<svg class="mico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 14l4.5-4.5 4 4L15 10l6 5.5"/></svg>';
}

export function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
