/**
 * theme-page.js — the Appearance screen.
 *
 * One radio group, one save. Small enough that the interesting decisions are
 * all about failure:
 *
 * NO BACKEND IS A WORKING STATE, NOT AN ERROR
 * -------------------------------------------
 * The storefront reads its theme from localStorage first and corrects it from
 * the API second (modules/theme/theme.js). That means this screen can publish
 * a theme with no backend at all — it writes the same cache key, and the shop
 * picks it up. So a 404 from the API is reported honestly ("saved on this
 * device only") rather than as a failure, because the merchant WILL see the
 * change when they open the shop, and telling them it failed would be a lie
 * they can disprove in one click.
 *
 * THE CACHE IS WRITTEN EVEN WHEN THE SERVER SUCCEEDS
 * --------------------------------------------------
 * Same origin, so the admin panel and the storefront share localStorage.
 * Writing it here means the merchant's own next page load is already correct
 * instead of showing them the old theme once while theme.js catches up — the
 * one person guaranteed to be looking for the change.
 */

import { adminFetch } from '/modules/admin/backend/api.js';
import { storage, KEYS } from '/shared/js/core/storage.js';

const THEMES = ['classic', 'luxe'];

/** What the shop is currently set to, best-effort, most authoritative first. */
async function loadTheme() {
  try {
    const { data } = await adminFetch('/theme');
    if (THEMES.includes(data?.theme)) return { theme: data.theme, source: 'server' };
  } catch { /* fall through — no backend, or not permitted */ }

  const cached = storage.get(KEYS.THEME, null);
  return { theme: THEMES.includes(cached) ? cached : 'classic', source: 'cache' };
}

document.addEventListener('admin:ready', init);

async function init() {
  const form = document.querySelector('[data-theme-form]');
  if (!form) return;

  const status = form.querySelector('[data-theme-status]');
  const saveBtn = form.querySelector('[data-theme-save]');

  const { theme: live } = await loadTheme();
  markLive(form, live);
  const input = form.querySelector(`input[name="theme"][value="${live}"]`);
  if (input) input.checked = true;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chosen = new FormData(form).get('theme');
    if (!THEMES.includes(chosen)) return;

    saveBtn.disabled = true;
    status.textContent = 'Publishing…';

    // Written first and unconditionally: this is the value the storefront
    // actually reads on the next paint, and it must not depend on a server
    // this deployment may not have yet.
    storage.set(KEYS.THEME, chosen);

    let message;
    try {
      await adminFetch('/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: chosen }),
      });
      message = `${label(chosen)} is live for everyone.`;
    } catch (err) {
      message = (err.status === 404 || !err.status)
        ? `${label(chosen)} is live on this device. Connect the backend to publish it to every visitor.`
        : `Couldn’t publish: ${err.message}`;
    }

    markLive(form, chosen);
    status.textContent = message;
    saveBtn.disabled = false;
  });
}

function label(theme) {
  return theme === 'luxe' ? 'Luxe' : 'Classic';
}

/** The "Live" flag next to whichever option the shop is actually serving. */
function markLive(form, theme) {
  form.querySelectorAll('[data-live-for]').forEach((flag) => {
    flag.hidden = flag.getAttribute('data-live-for') !== theme;
  });
}
