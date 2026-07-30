/**
 * library-page.js — the Images screen.
 *
 * The picker sheet already lists, searches and uploads, so this screen does not
 * reimplement any of that: "Upload images" opens the same sheet, and closing it
 * refreshes the grid. What this screen adds is the two things the picker
 * deliberately does not offer, because they are destructive and it is used
 * mid-task: writing alt text, and deleting.
 */

import { adminFetch } from '/modules/admin/backend/api.js';
import { escapeHtml } from '/modules/admin/admin-shell.js';
import { pickImage } from './media-picker.js';

let items = [];
let page = 1;
let pages = 1;
let term = '';

document.addEventListener('admin:ready', init);

function init() {
  if (!document.querySelector('[data-lib-grid]')) return;

  document.querySelector('[data-lib-upload]')?.addEventListener('click', async () => {
    // The sheet resolves with whatever was picked, which we ignore — the point
    // here was the upload, and the grid needs the new rows either way.
    await pickImage();
    load(1);
  });

  let debounce;
  document.querySelector('[data-lib-search]')?.addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      term = e.target.value.trim();
      load(1);
    }, 250);
  });

  document.querySelector('[data-lib-more]')?.addEventListener('click', () => load(page + 1));

  load(1);
}

async function load(next) {
  const grid = document.querySelector('[data-lib-grid]');
  if (next === 1) grid.innerHTML = '<p class="admin__sub">Loading images…</p>';

  let res;
  try {
    const q = term ? `&q=${encodeURIComponent(term)}` : '';
    res = await adminFetch(`/media?page=${next}&perPage=48${q}`);
  } catch (err) {
    grid.innerHTML = `<p class="admin__sub">${escapeHtml(err.message)}</p>`;
    return;
  }

  page = res.meta.page;
  pages = res.meta.pages;
  items = next === 1 ? res.data : [...items, ...res.data];

  document.querySelector('[data-lib-count]').textContent = res.meta.total === 0
    ? 'No images yet'
    : `${res.meta.total} image${res.meta.total === 1 ? '' : 's'}`;

  paint();
}

function paint() {
  const grid = document.querySelector('[data-lib-grid]');

  grid.innerHTML = items.length
    ? items.map(cell).join('')
    : `<p class="admin__sub">${term ? 'Nothing matches that.' : 'No images yet — upload your first one.'}</p>`;

  grid.querySelectorAll('[data-alt]').forEach((input) => {
    // Save on blur, not on every keystroke: alt text is a sentence, and a
    // request per character would be both wasteful and jumpy on mobile data.
    input.addEventListener('blur', () => saveAlt(input));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });

  grid.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => remove(btn.dataset.del));
  });

  document.querySelector('[data-lib-more]').hidden = page >= pages;
}

function cell(a) {
  const kb = a.bytes > 1024 * 1024
    ? `${(a.bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(a.bytes / 1024)} KB`;

  return `
    <figure class="mlib__item" data-item="${a.id}">
      <div class="mlib__pic">
        <img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.alt || '')}" loading="lazy">
        ${a.usedBy ? `<span class="mtile__used" title="Used in ${a.usedBy} place(s)">${a.usedBy}</span>` : ''}
      </div>
      <figcaption class="mlib__meta">
        <span class="mlib__name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
        <span class="mlib__dims">${a.width}&times;${a.height} · ${kb}</span>
      </figcaption>

      <!-- Alt text is a plain field on the card rather than behind an edit
           mode. It is the only accessibility work this panel asks for, and
           anything that takes two clicks to reach does not get written. -->
      <input class="input-gr mlib__alt" type="text" data-alt="${a.id}"
             value="${escapeHtml(a.alt || '')}"
             placeholder="Describe this image">

      <button type="button" class="mbtn mbtn--quiet mlib__del" data-del="${a.id}">Delete</button>
    </figure>`;
}

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

  // Ask twice when the image is in use, once when it is not. The second
  // confirmation exists because the first delete attempt is refused by the
  // server with a count, and re-sending with ?force is a genuinely different
  // decision — the merchant is now choosing to break something.
  if (!confirm(`Delete "${record?.name ?? 'this image'}"? This cannot be undone.`)) return;

  try {
    await adminFetch(`/media/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (err.status === 409) {
      if (!confirm(`${err.message}\n\nDelete it anyway?`)) return;

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
  paint();
  note('Image deleted.', true);
}

function note(message, ok) {
  const el = document.querySelector('[data-lib-note]');
  el.textContent = message;
  el.hidden = false;
  el.style.background = ok ? 'rgba(46,160,67,.10)' : '';
  el.style.color = ok ? '#1a7f37' : '';
}
