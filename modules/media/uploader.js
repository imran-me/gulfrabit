/**
 * uploader.js — putting files on the server, with a progress row each.
 *
 * Lifted out of media-picker.js so the Images screen can upload too. Two
 * copies of this would have drifted on the day one of them learned about
 * folders and the other did not, and the failure would look like "uploads from
 * the picker file correctly, uploads from the library do not" — a bug report
 * nobody can reproduce because both paths look identical from outside.
 *
 * The host passes a container; this fills it with rows. It knows nothing about
 * sheets, grids or folders beyond the id it is told to file into.
 */

import { csrfHeader } from '/modules/admin/backend/api.js';

const MAX_BYTES = 8 * 1024 * 1024;

/** What a file input should accept. SVG is refused server-side — see README. */
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

/** True when what is being dragged came from outside the browser. */
export function isFileDrag(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files');
}

/**
 * Upload every image in `files`, one request each.
 *
 * One request per file, deliberately: an 8 MB photo failing on a patchy mobile
 * connection must not discard the four that already went up, and a progress
 * bar per file is real rather than a guess averaged over a batch.
 *
 * @param {File[]} files
 * @param {{folderId?: number|null, queue: HTMLElement,
 *          onUploaded?: (data: object, duplicate: boolean) => void}} opts
 * @returns {Promise<{ok: number, failed: number, skipped: number}>}
 */
export async function uploadFiles(files, { folderId = null, queue, onUploaded } = {}) {
  // A folder dragged from the desktop arrives as an entry with no type, and a
  // PDF arrives with the wrong one. Filtering here rather than failing at the
  // server keeps the queue honest: a row that appears is a row that is trying.
  const images = [...files].filter((f) => f.type.startsWith('image/'));

  const summary = { ok: 0, failed: 0, skipped: [...files].length - images.length };

  if (!images.length) return summary;

  queue.hidden = false;

  await Promise.all(images.map(async (file) => {
    const row = document.createElement('div');
    row.className = 'mrow';
    row.innerHTML = `
      <span class="mrow__name">${escapeText(file.name)}</span>
      <span class="mrow__bar"><i style="width:0%"></i></span>
      <span class="mrow__state">waiting</span>`;

    queue.append(row);

    // Checked here as well as at the server so the answer is instant and the
    // 8 MB never leaves the phone.
    if (file.size > MAX_BYTES) {
      fail(row, 'over 8 MB');
      summary.failed += 1;
      return;
    }

    const result = await send(file, row, folderId);

    if (result.ok) {
      summary.ok += 1;
      if (result.data) onUploaded?.(result.data, !!result.duplicate);
    } else {
      summary.failed += 1;
    }
  }));

  // Leave failures on screen — they are the only record of what did not make
  // it, and clearing them would turn a partial upload into a silent one.
  if (!summary.failed) {
    setTimeout(() => {
      queue.querySelectorAll('.mrow.is-done').forEach((r) => r.remove());
      if (!queue.children.length) queue.hidden = true;
    }, 2000);
  }

  return summary;
}

function send(file, row, folderId) {
  return new Promise(async (resolve) => {
    const bar = row.querySelector('.mrow__bar i');
    const label = row.querySelector('.mrow__state');
    label.textContent = 'uploading';

    let headers;
    try {
      headers = await csrfHeader();
    } catch {
      fail(row, 'session expired');
      return resolve({ ok: false });
    }

    // XHR rather than fetch, only because fetch still has no upload progress in
    // any shipping browser. On mobile data an 8 MB photo is a slow minute, and
    // a spinner with no progress reads as a hang.
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append('file', file);

    // "All images" and the top level are both the top level for an upload —
    // there is no such place as "everywhere" to put a new file.
    if (folderId != null) body.append('folderId', String(folderId));

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

        // The full sentence says WHERE a duplicate already lives, which is the
        // part that explains why it did not appear in the folder just uploaded
        // into.
        if (payload.message) row.title = payload.message;

        return resolve({ ok: true, data: payload.data, duplicate: payload.duplicate });
      }

      fail(row, payload.message || `failed (${xhr.status})`);
      resolve({ ok: false });
    });

    xhr.addEventListener('error', () => {
      fail(row, 'network error');
      resolve({ ok: false });
    });

    xhr.open('POST', '/api/admin/media');
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    // Content-Type is deliberately NOT set: the browser must add the multipart
    // boundary itself, and setting it by hand produces a body PHP cannot parse.
    xhr.send(body);
  });
}

function fail(row, message) {
  row.classList.add('is-failed');
  row.querySelector('.mrow__state').textContent = message;
}

function escapeText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
