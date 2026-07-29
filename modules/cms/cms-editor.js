/**
 * cms-editor.js — click-to-edit, on the real page.
 *
 * WHY IT EDITS THE LIVE PAGE RATHER THAN A FORM IN THE PANEL
 * ----------------------------------------------------------
 * A headline is only judgeable in the place it appears, at the width it appears
 * at, next to the things around it. A form in an admin screen shows a text box;
 * this shows the actual page, and the edit is made where the consequence is
 * visible.
 *
 * WHAT IT CANNOT DO
 * -----------------
 * It writes through the same two channels the storefront renderer uses —
 * `textContent`, and a validated image `src`/`alt`. There is no rich-text
 * editor, no formatting toolbar, no HTML. Layout is not editable because layout
 * is never touched: an editor selects a node the developer marked as content
 * and changes what it says.
 *
 * Loaded only when `?edit=1` is present AND the visitor holds an admin session.
 * The session check is the server's — this asks, and the write endpoints refuse
 * anyone the middleware does not recognise, so the URL parameter alone unlocks
 * nothing.
 */

import { getSession, csrfHeader } from '../admin/backend/api.js';

const PAGE = document.documentElement.dataset.cmsPage;
const WANTED = new URLSearchParams(location.search).get('edit') === '1';

if (PAGE && WANTED) start();

async function start() {
  const session = await getSession().catch(() => null);

  // No session, or a role without `content`. Say so rather than silently doing
  // nothing — somebody who added ?edit=1 is expecting something to happen.
  if (!session?.capabilities?.includes('content')) {
    return banner('Sign in to the staff panel as an editor to edit this page.', false);
  }

  document.body.classList.add('cms-editing');
  banner('Editing content. Click any highlighted text or image.', true);

  document.querySelectorAll('[data-cms]').forEach(markEditable);
}

function markEditable(node) {
  node.classList.add('cms-editable');
  node.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    edit(node);
  });
}

async function edit(node) {
  const key = node.dataset.cms;
  const isImage = node.tagName === 'IMG' || !!node.querySelector('img');

  if (isImage) return editImage(node, key);

  // A plain prompt, deliberately. A rich editor would invite formatting, and
  // formatting is markup, and markup is the one thing this feature does not do.
  const next = prompt(`Text for “${key}”:`, node.textContent.trim());
  if (next === null) return;

  await save({ key, page: PAGE, type: 'text', value: next.trim() }, () => {
    node.textContent = next.trim();
  });
}

async function editImage(node, key) {
  const img = node.tagName === 'IMG' ? node : node.querySelector('img');

  const src = prompt(
    `Image path for “${key}” — must be a file on this site, under /assets/ or /uploads/:`,
    img.getAttribute('src') || '',
  );
  if (src === null) return;

  const alt = prompt('Alt text (describes the image for screen readers):', img.alt || '');
  if (alt === null) return;

  await save({ key, page: PAGE, type: 'image', value: src.trim(), alt: alt.trim() }, () => {
    img.src = src.trim();
    img.alt = alt.trim();
  });
}

async function save(body, applyLocally) {
  try {
    const res = await fetch('/api/admin/cms/blocks', {
      method: 'PUT',
      credentials: 'same-origin',
      // Same CSRF handshake as every other admin write — see csrfHeader().
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(await csrfHeader()),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      // The server's reason, not a generic failure. "Images must live under
      // /assets/" is actionable; "could not save" is not.
      return banner(payload.message || `Could not save (${res.status}).`, false);
    }
  } catch {
    return banner('Could not reach the server. Nothing was saved.', false);
  }

  // Only after the server confirms. Painting first would show an edit that did
  // not happen, and the page would look right until it was reloaded.
  applyLocally();
  banner('Saved.', true);
}

function banner(message, ok) {
  let el = document.querySelector('[data-cms-banner]');
  if (!el) {
    el = document.createElement('div');
    el.dataset.cmsBanner = '';
    el.className = 'cms-banner';
    document.body.prepend(el);
  }
  el.textContent = message;
  el.classList.toggle('cms-banner--bad', !ok);
}
