/**
 * couriers-page.js — the courier settings screen.
 *
 * Read-only for now. Editing credentials is deliberately not built: there is
 * nothing to store yet, and a form that saves an API key into a table nobody
 * has tested against a live courier would be a security surface bought for no
 * benefit. It arrives with the first real adapter.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

document.addEventListener('admin:ready', load);

async function load() {
  const body = document.querySelector('[data-couriers-body]');
  if (!body) return;

  let data;
  try {
    ({ data } = await adminFetch('/couriers'));
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — couriers appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    return;
  }

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="5" class="atable__empty">No couriers configured.</td></tr>';
    return;
  }

  body.innerHTML = data.map((c) => `
    <tr>
      <td><strong>${escapeHtml(c.name)}</strong><div class="atable__sub">${escapeHtml(c.key)}</div></td>
      <td>${
        // Three distinct states, named. "Manual" is not a failure — it is how
        // the business runs today — so it gets a neutral pill, not a red one.
        c.isConfigured
          ? '<span class="apill apill--ok">API connected</span>'
          : '<span class="apill apill--wait">Manual</span>'
      }</td>
      <td class="atable__sub">${c.hasDriver ? 'Driver available' : 'No adapter written'}</td>
      <td class="atable__sub">${escapeHtml(c.supportPhone || '—')}</td>
      <td>${c.isActive ? '<span class="apill apill--ok">On</span>' : '<span class="apill apill--wait">Off</span>'}</td>
    </tr>`).join('');
}
