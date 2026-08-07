/**
 * admin-shell.js — layout, navigation and the session guard for the panel.
 *
 * THE NAV IS CONTRIBUTED, NOT HARDCODED
 * -------------------------------------
 * Modules call `registerScreen()` to add themselves to the sidebar. This file
 * imports nothing from courier, inventory, accounting or cms — it cannot, or
 * deleting one of them would break the shell. `tools/assemble.py` decides which
 * admin scripts load on an admin page; delete a module and its assemble entry
 * and its nav item is simply never registered.
 *
 * THE GUARD HERE IS A CONVENIENCE, NOT A CONTROL
 * ----------------------------------------------
 * These pages are static files. Anyone can open them. That is acceptable only
 * because they contain no data: every number arrives from an endpoint behind
 * the server's `admin` middleware, which is the actual authority. The redirect
 * below exists so a signed-out staff member sees a login form instead of a page
 * full of empty boxes — nothing more. Never move an access decision into it.
 */

import { adminFetch, getSession, signOut } from './backend/api.js';

/** @type {Array<{id:string,label:string,href:string,area:string,group:string,icon:string,order:number}>} */
const screens = [];

/**
 * Add a screen to the admin sidebar.
 *
 * @param {object}  screen
 * @param {string}  screen.id     stable key, e.g. 'orders'
 * @param {string}  screen.label  sidebar text
 * @param {string}  screen.href   page URL
 * @param {string}  screen.area   capability required — must match one of the
 *   areas in AdminUser::CAPABILITIES. A screen whose area the signed-in role
 *   lacks is not rendered, and its endpoints would refuse it anyway.
 * @param {string[]} [screen.match] extra page paths that count as "inside"
 *   this screen, so a detail view keeps its section highlighted in the sidebar.
 * @param {string} [screen.group] sidebar section heading
 * @param {string} [screen.icon]  inline SVG
 * @param {number} [screen.order] sort within the group
 */
export function registerScreen(screen) {
  if (!screen?.id || !screen.area) {
    console.warn('[admin] ignoring screen without id/area', screen);
    return;
  }
  screens.push({ group: 'General', icon: '', order: 100, match: [], ...screen });
}

/* Modules register during their own module-script evaluation, which finishes
   before DOMContentLoaded. Booting here means the sidebar is painted once, with
   everything present, rather than reflowing as each module arrives. */
document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  const root = document.querySelector('[data-admin-shell]');
  if (!root) return;

  /* TWO MODULE INSTANCES, ONE BOOT.
     The build stamps <script src> with ?v=<hash>, and every screen imports
     './admin-shell.js' with no query. ES modules are keyed by resolved URL,
     query included, so those are two different modules and BOTH evaluate this
     file's top level — both register DOMContentLoaded, both reach here, and
     admin:ready is dispatched twice. Each screen's init() then runs twice and
     binds every listener twice, which is silent for anything idempotent and
     fatal for anything that toggles: "+ New product" opened the create form
     and closed it again inside one click, so no product could be added to the
     catalogue at all, with no error to explain it. Submit handlers were bound
     twice too, so a save that did get through would have POSTed twice.

     The flag lives on the document, not in a module variable: a module-scoped
     flag is per-instance, and the whole problem is that there are two
     instances. Both handlers run in the same task and this is set before the
     first await, so the second sees it. */
  if (document.documentElement.dataset.adminBooted) return;
  document.documentElement.dataset.adminBooted = '1';

  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

  if (!session) {
    // `next` so signing in returns you to the screen you actually wanted.
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(`/modules/admin/login.html?next=${next}`);
    return;
  }

  if (session.isFixture) warnFixture();
  paintIdentity(session);
  paintNav(session);
  root.hidden = false;
  document.dispatchEvent(new CustomEvent('admin:ready', { detail: { session } }));
}

/**
 * A banner nobody can miss, on every screen, whenever the session is a fixture.
 *
 * The console already warns, but a console warning is invisible to the person
 * actually using the panel — and "this panel is not secured" is not something
 * to leave in a place only a developer looks. If real data ever ends up on a
 * screen in this state, the banner is what stops someone assuming it was safe.
 */
function warnFixture() {
  document.body.insertAdjacentHTML('afterbegin', `
    <div class="admin-fixture" role="status">
      <strong>Fixture session.</strong>
      <span>No backend is running, so nobody has been authenticated and nothing here is secured.
      This must never be reachable outside local development.</span>
    </div>`);
}

function paintIdentity(session) {
  const nameEl = document.querySelector('[data-admin-name]');
  const roleEl = document.querySelector('[data-admin-role]');
  if (nameEl) nameEl.textContent = session.name;
  if (roleEl) roleEl.textContent = session.role;

  document.querySelector('[data-admin-signout]')?.addEventListener('click', async () => {
    await signOut();
    location.replace('/modules/admin/login.html');
  });
}

function paintNav(session) {
  const host = document.querySelector('[data-admin-nav]');
  if (!host) return;

  // Hide what this role cannot open. The server enforces the same rule, so
  // this is about not offering a door that will be shut in their face.
  const allowed = screens.filter((s) => session.capabilities.includes(s.area));

  const groups = new Map();
  for (const s of allowed.sort((a, b) => a.order - b.order)) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }

  const here = location.pathname;
  /* A screen is "current" when you are on its own page or on one of the detail
     pages it owns. Without `match`, opening an order left nothing highlighted
     and the sidebar stopped telling you where you were. Compared as full paths
     rather than by suffix, because "order.html".endsWith("orders.html") is the
     kind of near-miss that silently highlights the wrong row. */
  const isCurrent = (s) => here === s.href || s.match.includes(here);
  host.innerHTML = [...groups]
    .map(([group, items]) => `
      <div class="anav__group">
        <p class="anav__title">${escapeHtml(group)}</p>
        <ul role="list">
          ${items.map((s) => `
            <li>
              <a class="anav__link${isCurrent(s) ? ' is-current' : ''}"
                 href="${escapeHtml(s.href)}">
                <span class="anav__icon" aria-hidden="true">${s.icon}</span>
                <span>${escapeHtml(s.label)}</span>
              </a>
            </li>`).join('')}
        </ul>
      </div>`)
    .join('');

  if (!allowed.length) {
    host.innerHTML = '<p class="anav__empty">Your role has no screens assigned. Ask an owner.</p>';
  }
}

/**
 * Shared fetch for admin screens — re-exported so a module never has to know
 * how the session is carried.
 */
export { adminFetch };

export function escapeHtml(str = '') {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
