/**
 * dashboard-page.js — the panel's landing screen.
 *
 * Renders whatever cards the server chose to send. It does not decide which
 * cards a role may see; that decision is made in AdminDashboardController, so
 * a role that may not see revenue is never sent the number in the first place.
 * Client-side hiding would still have put it in the response body.
 */

import { adminFetch } from './backend/api.js';
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
