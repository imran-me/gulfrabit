/**
 * theme-page.js — the Appearance screen.
 *
 * One radio group, one publish. Small enough that the interesting decisions
 * are all about telling the truth.
 *
 * PUBLISHING IS A SERVER ACTION OR IT IS NOTHING
 * ----------------------------------------------
 * The theme is universal — one setting, every visitor. So this screen writes
 * it in exactly one place, the server, and it does NOT mirror the value into
 * localStorage on the way past.
 *
 * It used to. That was a bug in the shape of a convenience: with no backend
 * the write "succeeded" locally, the merchant opened the shop and saw Luxe,
 * and every actual visitor still saw Classic. A control that shows you a shop
 * nobody else is looking at is worse than a control that fails, because the
 * failure is invisible until a customer mentions it. Now the only writer of
 * that cache is modules/theme/theme.js, after a successful server READ — so
 * the cache can only ever be a mirror of what the world is seeing.
 *
 * PREVIEW IS A DIFFERENT VERB, AND IT SAYS SO
 * -------------------------------------------
 * Looking at a theme before committing to it is a real need, and it is not
 * publishing. Preview opens the shop with ?theme=… — no storage beyond the
 * tab, nothing published, and a URL the merchant can send to somebody else.
 */

import { adminFetch, isBackendAbsent } from '/modules/admin/backend/api.js';

const THEMES = ['classic', 'luxe', 'trio', 'noor'];

/**
 * What the shop is serving, and whether anyone can change it from here.
 *
 * `reachable: false` means there is no backend — so the live theme is
 * whichever one was baked into the HTML at build time, and this screen cannot
 * change it for visitors. Saying so plainly is the entire job of this return
 * value.
 */
async function loadTheme() {
  try {
    const { data } = await adminFetch('/theme');
    if (THEMES.includes(data?.theme)) return { theme: data.theme, reachable: true };
    return { theme: 'classic', reachable: true };
  } catch (err) {
    if (isBackendAbsent(err)) return { theme: null, reachable: false };
    throw err;
  }
}

document.addEventListener('admin:ready', init);

async function init() {
  const form = document.querySelector('[data-theme-form]');
  if (!form) return;

  const status = form.querySelector('[data-theme-status]');
  const saveBtn = form.querySelector('[data-theme-save]');
  const previewLink = form.querySelector('[data-theme-preview]');
  const offline = form.querySelector('[data-theme-offline]');

  let live = null;
  try {
    const res = await loadTheme();
    live = res.theme;
    if (!res.reachable) {
      // Not an error state — a static deployment is a supported way to run
      // this shop. But the merchant has to know that this button cannot reach
      // the visitors, and what does.
      offline.hidden = false;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Publishing needs the backend';
    }
  } catch (err) {
    status.textContent = `Couldn’t read the current theme: ${err.message}`;
  }

  markLive(form, live);
  if (live) {
    const input = form.querySelector(`input[name="theme"][value="${live}"]`);
    if (input) input.checked = true;
  }

  // The preview URL tracks the selection, so "Preview" always previews the
  // option the merchant is actually looking at rather than the published one.
  const syncPreview = () => {
    const chosen = new FormData(form).get('theme');
    previewLink.href = `/index.html?theme=${encodeURIComponent(chosen)}`;
  };
  form.addEventListener('change', syncPreview);
  syncPreview();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chosen = new FormData(form).get('theme');
    if (!THEMES.includes(chosen)) return;

    saveBtn.disabled = true;
    status.textContent = 'Publishing…';

    try {
      await adminFetch('/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: chosen }),
      });
      markLive(form, chosen);
      status.textContent = `${label(chosen)} is live. Every visitor sees it from their next page load.`;
    } catch (err) {
      status.textContent = isBackendAbsent(err)
        ? 'Not published — there is no backend to publish to. Nothing changed for visitors.'
        : `Couldn’t publish: ${err.message}`;
    }

    saveBtn.disabled = false;
  });
}

function label(theme) {
  return { luxe: 'Luxe', trio: 'Trio', noor: 'Noor' }[theme] ?? 'Classic';
}

/** The "Live" flag next to whichever option the shop is actually serving. */
function markLive(form, theme) {
  form.querySelectorAll('[data-live-for]').forEach((flag) => {
    flag.hidden = flag.getAttribute('data-live-for') !== theme;
  });
}
