/**
 * image-drawer.js — one image, up close.
 *
 * A thumbnail in a grid answers "which picture is this". It cannot answer "is
 * this the 2000px one or the phone screenshot", "what is its address", "where
 * is it used", or "is the alt text any good" — and those are the questions
 * that come up while filing. A grid that only zooms is a lightbox; this is the
 * inspector next to it.
 *
 * A side drawer, not a modal. The grid stays visible and stays navigable, so
 * arrow keys walk from one image to the next with the drawer open — which is
 * how you actually audit a folder, rather than open-close-open-close.
 */

import { escape } from './folders.js';
import { toast } from './toast.js';

let host = null;
let current = null;
let handlers = {};

/**
 * @param {object} asset
 * @param {{
 *   folderName?: string|null,
 *   onAlt?: (asset: object, alt: string) => Promise<void>,
 *   onMove?: (asset: object) => void,
 *   onDelete?: (asset: object) => void,
 *   onStep?: (delta: -1|1) => void,
 * }} opts
 */
export function openDrawer(asset, opts = {}) {
  handlers = opts;
  current = asset;

  if (!host) build();

  paint();

  host.hidden = false;
  requestAnimationFrame(() => host.classList.add('is-open'));
}

export function closeDrawer() {
  if (!host || host.hidden) return;

  host.classList.remove('is-open');
  setTimeout(() => { host.hidden = true; }, 240);

  current = null;
}

export function isDrawerOpen() {
  return !!host && !host.hidden;
}

/** Keep the drawer honest when the grid reloads underneath it. */
export function refreshDrawer(asset) {
  if (!isDrawerOpen() || !asset || asset.id !== current?.id) return;

  current = asset;
  paint();
}

function build() {
  host = document.createElement('aside');
  host.className = 'mdrawer';
  host.hidden = true;
  host.innerHTML = `
    <div class="mdrawer__scrim" data-close></div>
    <div class="mdrawer__panel" role="dialog" aria-modal="false" aria-label="Image details">
      <header class="mdrawer__head">
        <div class="mdrawer__steps">
          <button type="button" class="mdrawer__step" data-step="-1" aria-label="Previous image">&#8592;</button>
          <button type="button" class="mdrawer__step" data-step="1" aria-label="Next image">&#8594;</button>
        </div>
        <button type="button" class="mdrawer__x" data-close aria-label="Close">&times;</button>
      </header>
      <div class="mdrawer__body" data-body></div>
    </div>`;

  document.body.append(host);

  host.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', closeDrawer));

  host.querySelectorAll('[data-step]').forEach((el) =>
    el.addEventListener('click', () => handlers.onStep?.(Number(el.dataset.step))));

  document.addEventListener('keydown', (e) => {
    if (!isDrawerOpen()) return;

    // Not while typing in the alt field — Escape there should mean "stop
    // editing", and the arrows should move the caret.
    if (e.target.matches('input, textarea')) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    if (e.key === 'Escape') closeDrawer();
    if (e.key === 'ArrowLeft') handlers.onStep?.(-1);
    if (e.key === 'ArrowRight') handlers.onStep?.(1);
  });
}

function paint() {
  const a = current;
  const body = host.querySelector('[data-body]');

  body.innerHTML = `
    <div class="mdrawer__stage">
      <img src="${escape(a.url)}" alt="${escape(a.alt || '')}">
    </div>

    <h2 class="mdrawer__name" title="${escape(a.name)}">${escape(a.name)}</h2>

    <dl class="mdrawer__facts">
      <div><dt>Size on screen</dt><dd>${a.width} &times; ${a.height} px</dd></div>
      <div><dt>File size</dt><dd>${bytes(a.bytes)}</dd></div>
      <div><dt>Filed under</dt><dd>${escape(handlers.folderName || 'Top level')}</dd></div>
      <div><dt>Used in</dt><dd>${
        a.usedBy ? `${a.usedBy} place${a.usedBy === 1 ? '' : 's'}` : 'nothing yet'
      }</dd></div>
      <div><dt>Uploaded</dt><dd>${when(a.uploaded)}</dd></div>
    </dl>

    <label class="mdrawer__field">
      <span>Description (alt text)</span>
      <textarea class="input-gr" rows="2" data-alt
                placeholder="What is in the picture? Screen readers and search engines read this."
                maxlength="255">${escape(a.alt || '')}</textarea>
      <small>${
        a.alt
          ? 'Saved when you click away.'
          : 'Not written yet — this is the only part of an image a screen reader can read.'
      }</small>
    </label>

    <div class="mdrawer__url">
      <input class="input-gr" type="text" readonly value="${escape(a.url)}" data-url
             aria-label="Web address of this image">
      <button type="button" class="mbtn" data-copy>Copy link</button>
    </div>

    <div class="mdrawer__acts">
      <a class="mbtn" href="${escape(a.url)}" target="_blank" rel="noopener">Open full size</a>
      <button type="button" class="mbtn" data-move>Move to folder…</button>
      <button type="button" class="mbtn is-danger" data-delete>Delete</button>
    </div>`;

  const alt = body.querySelector('[data-alt]');

  alt.addEventListener('blur', async () => {
    const value = alt.value.trim();
    if ((current.alt || '') === value) return;

    await handlers.onAlt?.(current, value);
    current.alt = value || null;
  });

  body.querySelector('[data-copy]').addEventListener('click', async () => {
    const url = new URL(a.url, location.origin).href;

    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied.');
    } catch {
      // Clipboard access is refused on an insecure origin and in some
      // in-app browsers. Selecting the field means the merchant can still
      // reach the link with the keyboard rather than being told "no".
      const field = body.querySelector('[data-url]');
      field.focus();
      field.select();
      toast('Press Ctrl+C to copy — the browser would not do it for us.', { tone: 'info' });
    }
  });

  body.querySelector('[data-move]').addEventListener('click', () => handlers.onMove?.(current));
  body.querySelector('[data-delete]').addEventListener('click', () => handlers.onDelete?.(current));
}

function bytes(n) {
  return n > 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;
}

function when(iso) {
  if (!iso) return '—';

  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);

  // "3 days ago" is what someone filing actually wants; the exact stamp is
  // there on hover for the one time a year it matters.
  const rough = days <= 0 ? 'today'
    : days === 1 ? 'yesterday'
      : days < 30 ? `${days} days ago`
        : then.toLocaleDateString();

  return `<time datetime="${escape(iso)}" title="${escape(then.toLocaleString())}">${rough}</time>`;
}
