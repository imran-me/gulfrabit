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

/* Shared across module instances for the same reason the boot flag lives on
   the document (see boot): the build's versioned <script src> and the nav
   files' unversioned imports evaluate this file twice, as two instances with
   two copies of every module variable. The instance that boots first is the
   versioned one, and the screens are registered into the unversioned one — a
   module-scoped array here means the sidebar paints from the empty copy and
   an owner is told their role has no screens. */
/** @type {Array<{id:string,label:string,href:string,area:string,group:string,icon:string,order:number}>} */
const screens = (globalThis.grAdminScreens ??= []);

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
  const allowed = paintNav(session);
  wireRail(root);
  wirePalette(root, allowed);
  wireMasthead(root);
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

/* The rail preference, remembered per browser rather than per account: it is
   about the screen somebody is sitting at, not about who they are. A staff
   member on a 13" laptop wants it railed on that laptop and open on the
   desk monitor, under the same sign-in.

   Applied while the shell is still `hidden`, so the panel never paints wide
   and then snaps narrow. */
const RAIL_KEY = 'gr:admin-rail';

function wireRail(root) {
  const btn = root.querySelector('[data-admin-rail]');
  if (!btn) return;

  let on = false;
  try {
    on = localStorage.getItem(RAIL_KEY) === 'on';
  } catch {
    /* Private mode. The panel opens wide, which is the safe default. */
  }
  apply(on);

  btn.addEventListener('click', () => {
    on = !on;
    apply(on);
    try {
      localStorage.setItem(RAIL_KEY, on ? 'on' : 'off');
    } catch { /* nothing to remember it with; the toggle still works this visit */ }
  });

  function apply(state) {
    root.classList.toggle('is-rail', state);
    btn.setAttribute('aria-expanded', String(!state));
    btn.setAttribute('aria-label', state ? 'Expand sidebar' : 'Collapse sidebar');
  }
}

function paintIdentity(session) {
  const nameEl = document.querySelector('[data-admin-name]');
  const roleEl = document.querySelector('[data-admin-role]');
  if (nameEl) nameEl.textContent = session.name;
  if (roleEl) roleEl.textContent = session.role;

  document.querySelector('[data-admin-signout]')?.addEventListener('click', async () => {
    await signOut();
    location.replace('/admin/login');
  });
}

/**
 * Paints the sidebar and hands back the screens this role may open, so the
 * jump-to list is built from the same filtered set rather than a second copy
 * of the same rule. Two places deciding what a warehouse account may see is
 * how one of them ends up offering a door the other has already shut.
 */
function paintNav(session) {
  const host = document.querySelector('[data-admin-nav]');
  if (!host) return [];

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
    return allowed;
  }

  scrollCurrentIntoView(host);
  return allowed;
}

/**
 * On a phone the sidebar is one sideways-scrolling row of sixteen chips, and
 * it opens at the start of that row — so someone who tapped through to an
 * order is looking at Dashboard and Orders while the screen they are actually
 * on sits off the right edge, with nothing marking where they are.
 *
 * Centred rather than merely scrolled to, because the point is to show what is
 * on either side of here, not to park the current chip against an edge.
 *
 * Rects rather than offsetLeft: `.anav` is not a positioned element, so
 * offsetParent is somewhere further up the sidebar and offsetLeft is measured
 * from there. And scrollLeft rather than scrollIntoView(), which on a row this
 * shallow will also scroll the PAGE to bring the strip into view — jumping
 * past the page heading on arrival at every screen.
 */
function scrollCurrentIntoView(host) {
  const current = host.querySelector('.anav__link.is-current');
  if (!current || host.scrollWidth <= host.clientWidth) return;

  const item = current.getBoundingClientRect();
  const row = host.getBoundingClientRect();
  host.scrollLeft += item.left - row.left - (row.width - item.width) / 2;
}

/**
 * Tells the masthead when it is holding position, so it can tighten up and
 * cast the shadow that says the rows are passing under it.
 *
 * An IntersectionObserver rather than a scroll listener: a scroll handler that
 * reads getBoundingClientRect() does it on every frame of every scroll, on the
 * screens with the longest tables, and forces a layout each time to answer a
 * question whose answer changes twice a page.
 *
 * The 1px top rootMargin is what makes it work at all. Stuck, the masthead's
 * top edge sits exactly at 0 and is therefore still fully inside the viewport;
 * shrinking the root by a pixel puts that edge outside it, so the ratio drops
 * below 1 at the moment it lands and returns to 1 when it lifts off.
 */
function wireMasthead(root) {
  const head = root.querySelector('.admin__head');
  if (!head || !('IntersectionObserver' in window)) return;

  new IntersectionObserver(
    ([entry]) => head.classList.toggle('is-stuck', entry.intersectionRatio < 1),
    { threshold: [1], rootMargin: '-1px 0px 0px 0px' },
  ).observe(head);
}

/* ---- Jump to a screen -----------------------------------------------------
   Sixteen screens in six groups. Even open, the sidebar does not show all of
   them on a 900px-tall laptop — Books and Settings are below the fold — and
   railed it shows none of their names. Somebody who knows they want the
   journal should not have to go looking for it in a list.

   So: Ctrl+K (Command+K on a Mac), and a button in the sidebar that says so.
   A shortcut nobody is told about is not a feature, and a panel used by
   warehouse staff and accountants cannot assume anyone read a changelog.

   The list is the screens THIS ROLE may open, taken from the same filtered
   array the sidebar was painted from. A jump-to that offers a door the sidebar
   has already shut is a way to find out your account is refused, one 403 at a
   time. */
function wirePalette(root, allowed) {
  const dlg = root.querySelector('[data-admin-palette]');
  const input = dlg?.querySelector('[data-palette-input]');
  const list = dlg?.querySelector('[data-palette-list]');
  const none = dlg?.querySelector('[data-palette-none]');
  const opener = root.querySelector('[data-admin-find]');
  if (!dlg || !input || !list || !none) return;

  /* The label on the button has to match the key that actually works. Printing
     "Ctrl K" to somebody on a Mac teaches them the wrong thing about the panel
     and then does nothing when they press it. */
  const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  const keyLabel = root.querySelector('[data-admin-find-key]');
  if (keyLabel) keyLabel.textContent = mac ? '⌘ K' : 'Ctrl K';

  let shown = [];
  let active = 0;

  render('');

  opener?.addEventListener('click', open);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'k' && e.key !== 'K') return;
    if (!(mac ? e.metaKey : e.ctrlKey)) return;
    // Only ours to take once we know we can honour it — otherwise the
    // browser's own Ctrl+K is swallowed for nothing.
    e.preventDefault();
    if (dlg.open) close(); else open();
  });

  /* Escape, the backdrop click and the focus trap are the dialog element's
     own doing. Nothing here re-implements them, which is the point of using
     one: a hand-rolled overlay's trap stops being true the moment somebody
     adds a focusable child, and nobody notices for a year. */
  dlg.addEventListener('close', () => {
    input.value = '';
    render('');
    opener?.setAttribute('aria-expanded', 'false');
  });

  // The backdrop is part of the dialog element, so a click on it lands on the
  // dialog itself rather than on any of its children.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  input.addEventListener('input', () => render(input.value.trim().toLowerCase()));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown')      move(1);
    else if (e.key === 'ArrowUp')   move(-1);
    else if (e.key === 'Home')      move(-shown.length);
    else if (e.key === 'End')       move(shown.length);
    else if (e.key === 'Enter')     go();
    else return;
    e.preventDefault();
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-index]');
    if (!li) return;
    active = Number(li.dataset.index);
    go();
  });

  /* Highlighting the row under the pointer as well as the one the arrows are
     on would give two "selected" rows and no way to tell which Enter takes. */
  list.addEventListener('pointermove', (e) => {
    const li = e.target.closest('[data-index]');
    if (li && Number(li.dataset.index) !== active) {
      active = Number(li.dataset.index);
      paintActive();
    }
  });

  function open() {
    if (dlg.open) return;
    dlg.showModal();
    opener?.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  function close() {
    if (dlg.open) dlg.close();
  }

  function render(q) {
    shown = q
      ? allowed.filter((s) => `${s.label} ${s.group}`.toLowerCase().includes(q))
      : allowed.slice();
    active = 0;

    list.innerHTML = shown.map((s, i) => `
      <li class="apal__item" role="option" id="apal-o${i}" data-index="${i}" aria-selected="false">
        <span class="apal__icon" aria-hidden="true">${s.icon}</span>
        <span class="apal__label">${highlight(s.label, q)}</span>
        <span class="apal__group">${escapeHtml(s.group)}</span>
      </li>`).join('');

    none.hidden = shown.length > 0;
    list.hidden = shown.length === 0;
    paintActive();
  }

  function move(by) {
    if (!shown.length) return;
    // Clamped, not wrapped. Held down, a wrapping list runs past the end and
    // back to the top, and you lose your place in a list of sixteen.
    active = Math.min(shown.length - 1, Math.max(0, active + by));
    paintActive();
  }

  function paintActive() {
    const rows = list.children;
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('is-active', i === active);
      rows[i].setAttribute('aria-selected', String(i === active));
    }
    // What the arrows are on, said out loud. Without it a screen reader
    // announces the box and never mentions that the selection moved.
    input.setAttribute('aria-activedescendant', shown.length ? `apal-o${active}` : '');
    rows[active]?.scrollIntoView({ block: 'nearest' });
  }

  function go() {
    const screen = shown[active];
    if (!screen) return;
    // Already here. Reloading the page you are standing on loses unsaved work
    // in the product editor for no gain.
    if (location.pathname === screen.href) return close();
    location.assign(screen.href);
  }
}

/**
 * The matched run of the label, marked. Every piece is escaped on its own and
 * only then joined, because escaping the whole string first moves the indices
 * this slices at — `&` becomes five characters and the mark lands mid-entity.
 */
function highlight(label, q) {
  if (!q) return escapeHtml(label);
  const at = label.toLowerCase().indexOf(q);
  if (at < 0) return escapeHtml(label);
  return escapeHtml(label.slice(0, at))
    + `<mark>${escapeHtml(label.slice(at, at + q.length))}</mark>`
    + escapeHtml(label.slice(at + q.length));
}

/**
 * Shared fetch for admin screens — re-exported so a module never has to know
 * how the session is carried.
 */
export { adminFetch };

/**
 * Escape a value for interpolation into HTML — including into an ATTRIBUTE.
 *
 * This used to serialise through a detached div's textContent. That escapes
 * &, < and > and NOTHING ELSE, because those are the only characters that
 * matter in text position — but ~265 call sites across the panel drop the
 * result inside a double-quoted attribute:
 *
 *     data-name="${escapeHtml(c.name)}"        customers-page.js
 *     aria-label="Delete ${escapeHtml(c.name)}"
 *
 * c.name is whatever the shopper typed into the checkout's Full name field. A
 * customer registering as   Rahim" onmouseenter="fetch('/api/admin/…')
 * closed the attribute and opened their own, stored, on a row the shop owner's
 * cursor crosses while working the orders list.
 *
 * Quotes are escaped now. &quot; renders as a plain " in text position, so
 * every existing call site keeps reading correctly and every attribute site
 * becomes safe at once. Same form as the escapers in category-menu.js and
 * reviews-panel.js — copied deliberately, so there is one shape to remember.
 */
export function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
