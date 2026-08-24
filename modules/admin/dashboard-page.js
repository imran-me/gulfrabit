/**
 * dashboard-page.js — the panel's landing screen.
 *
 * Renders whatever cards the server chose to send. It does not decide which
 * cards a role may see; that decision is made in AdminDashboardController, so
 * a role that may not see revenue is never sent the number in the first place.
 * Client-side hiding would still have put it in the response body.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
const CARD_LABELS = {
  todayCount:       ['Orders today', false],
  awaitingPack:     ['Awaiting packing', true],
  shipped:          ['In transit', false],
  todayRevenueTaka: ['Revenue today', false],
  lowStock:         ['Lines at or below reorder level', true],
  outOfStock:       ['Out of stock', true],
  unpostedEntries:  ['Unposted journal entries', true],
  quotesWaiting:    ['Quote requests waiting', true],
  awaitingRead:     ['Reviews waiting to be read', true],
};

/**
 * Where each card's work actually lives.
 *
 * Every number on this screen was a dead end: it told you five orders were
 * waiting to be packed and left you to navigate and re-filter to find them.
 * The landing screen names the work; it should also be the way in.
 *
 * A card without an entry here stays plain text on purpose — `todayRevenueTaka`
 * is a figure, not a queue, and there is no list of "revenue" to open.
 */
const CARD_LINKS = {
  // The server counts `placed` AND `confirmed` together, and the orders list
  // filters one status at a time — so this goes to the unfiltered list, where
  // the stage bar shows both counts side by side and they add up to this card.
  // A link to one of the two stages would show a smaller number than the card
  // that was clicked, which reads as the screen being wrong.
  awaitingPack:    () => '/admin/orders',
  shipped:         () => '/admin/orders?status=shipped',
  todayCount:      () => `/admin/orders?from=${today()}`,
  lowStock:        () => '/admin/stock?lowOnly=1',
  outOfStock:      () => '/admin/stock?lowOnly=1',
  unpostedEntries: () => '/admin/journal',
  quotesWaiting:   () => '/admin/quotes',
  awaitingRead:    () => '/admin/reviews',
};

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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
    const cls = `acard${isAction && Number(value) > 0 ? ' acard--action' : ''}`;
    const body = `<span class="acard__n">${shown}</span><span class="acard__l">${escapeHtml(label)}</span>`;

    // A zero is not worth a journey. Nothing is waiting, so the card states
    // that and stops being a button — a link to an empty list is a wasted
    // click every morning on the screen opened most.
    const href = Number(value) > 0 ? CARD_LINKS[key]?.() : null;

    return href
      ? `<a class="${cls} acard--link" href="${href}">${body}</a>`
      : `<div class="${cls}">${body}</div>`;
  }).join('');
}

/* ------------------------------------------------------------------ *
 * Setup check
 * ------------------------------------------------------------------ */

/**
 * Ask the server whether it is actually set up, and surface only the failures.
 *
 * Runs after the cards and never blocks them — a health check that delays the
 * dashboard has made things worse. It renders nothing at all when everything
 * passes: a permanent green panel on the screen you look at most often is
 * noise, and noise is exactly what stops a red one from being noticed.
 *
 * This exists so a broken deploy is visible where the merchant already is,
 * instead of needing a cron job and a log file to answer "did the migration
 * run?".
 */
async function checkSetup() {
  let data;
  try {
    ({ data } = await adminFetch('/health'));
  } catch {
    return;   // an older server without the endpoint; nothing to report
  }

  if (data.ok) return;

  const section = document.querySelector('[data-dash-health]');
  const list = document.querySelector('[data-dash-health-list]');
  if (!section || !list) return;

  list.innerHTML = data.checks
    .filter((c) => !c.ok)
    .map((c) => `
      <li class="arefund">
        <div><strong>${escapeHtml(c.name)}</strong> — ${escapeHtml(c.detail)}</div>
        ${c.fix ? `<div class="atable__sub">${escapeHtml(c.fix)}</div>` : ''}
      </li>`)
    .join('');

  section.hidden = false;
}

document.addEventListener('admin:ready', checkSetup);
