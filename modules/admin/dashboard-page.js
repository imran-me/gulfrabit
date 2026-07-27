/**
 * dashboard-page.js — the panel's landing screen.
 *
 * Renders whatever cards the server chose to send. It does not decide which
 * cards a role may see; that decision is made in AdminDashboardController, so
 * a role that may not see revenue is never sent the number in the first place.
 * Client-side hiding would still have put it in the response body.
 */

import { adminFetch } from './backend/api.js';
import { registerScreen } from './admin-shell.js';

/* Admin's own screens go through the same registry every other module uses.
   No special case for the module that owns the shell — if the contribution API
   is not good enough for its author, it is not good enough for anyone. */
registerScreen({
  id: 'dashboard',
  label: 'Dashboard',
  href: '/modules/admin/index.html',
  // 'dashboard' is granted to every role — see AdminUser::CAPABILITIES. The
  // controller still decides which cards each role receives, so landing here
  // never means being handed figures the role may not see.
  area: 'dashboard',
  group: 'Overview',
  order: 0,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
});

const CARD_LABELS = {
  todayCount:       ['Orders today', false],
  awaitingPack:     ['Awaiting packing', true],
  shipped:          ['In transit', false],
  todayRevenueTaka: ['Revenue today', false],
  lowStock:         ['Lines at or below reorder level', true],
  outOfStock:       ['Out of stock', true],
  unpostedEntries:  ['Unposted journal entries', true],
};

document.addEventListener('admin:ready', ({ detail }) => paint(detail.session));

async function paint(session) {
  const host = document.querySelector('[data-dash-cards]');
  const sub = document.querySelector('[data-dash-sub]');
  if (!host) return;

  let data;
  try {
    ({ data } = await adminFetch('/dashboard'));
  } catch (err) {
    // No backend yet is the normal state during development, not an error
    // worth a red banner — say so plainly and move on.
    sub.textContent = err.status === 404 || !err.status
      ? 'No backend connected yet — cards will fill in once the API is live.'
      : err.message;
    document.querySelector('[data-dash-empty]').hidden = false;
    return;
  }

  sub.textContent = `Signed in as ${session.name}.`;

  const cards = Object.values(data.cards || {}).flatMap((group) => Object.entries(group));
  if (!cards.length) {
    document.querySelector('[data-dash-empty]').hidden = false;
    return;
  }

  host.innerHTML = cards.map(([key, value]) => {
    const [label, isAction] = CARD_LABELS[key] || [key, false];
    const shown = key.endsWith('Taka') ? `৳ ${Number(value).toLocaleString('en-BD')}` : value;
    return `
      <div class="acard${isAction && Number(value) > 0 ? ' acard--action' : ''}">
        <span class="acard__n">${shown}</span>
        <span class="acard__l">${label}</span>
      </div>`;
  }).join('');
}
