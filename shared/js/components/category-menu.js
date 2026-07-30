/**
 * category-menu.js — the header menu, built from the live categories.
 *
 * The mega-menu and the mobile drawer ship as real markup in
 * shared/components/header.html. That markup is the no-JavaScript fallback and
 * the first paint; this replaces it once the categories are known, so
 * switching a category off in the admin panel actually takes it out of the
 * navigation.
 *
 * WHAT IT REPLACES AND WHAT IT LEAVES ALONE
 * -----------------------------------------
 * Only the Shop column grid and the Shop accordion in the drawer. The fixed
 * items — Deals, Industrial, About, Contact, My Account — are hand-authored
 * and stay hand-authored. They are not categories, and a "menu manager" that
 * let someone delete Contact from the header would be a footgun, not a
 * feature.
 *
 * WHY IT FETCHES RATHER THAN IMPORTS
 * ----------------------------------
 * Same rule as the home page shelves: a fetch that fails leaves the authored
 * markup standing, an import that fails takes the header down. The nav is on
 * every page, so it is the last thing that should depend on an API being up.
 *
 * Runs once per page load, and the response is cached by the browser for an
 * hour (see .htaccess) — so this is one request on the first page and none
 * after it.
 */

/** Most columns the mega-menu can hold before it overflows the viewport. */
const MAX_COLUMNS = 4;

/** Links per column when packing categories that have no sub-categories. */
const PACK_SIZE = 5;

export function initCategoryMenu() {
  const grid = document.querySelector('[data-mega-grid]');
  const drawer = document.querySelector('[data-mobile-shop]');

  if (!grid && !drawer) return;

  load().then((categories) => {
    // An empty list is not the same as a failed request. It means every
    // category is switched off, which is a real state — but blanking the menu
    // over it would look like a broken site, so the authored markup stays.
    if (!categories.length) return;

    if (grid) grid.innerHTML = columns(categories).map(column).join('');
    if (drawer) drawer.innerHTML = categories.map(drawerRows).join('');
  });
}

async function load() {
  try {
    const res = await fetch('/api/catalog/categories', {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) return [];

    const { data } = await res.json();

    return (Array.isArray(data) ? data : [])
      .filter((c) => c.showInMenu !== false)
      // menuOrder first, then whatever order the server sent. Sorting by name
      // instead would ignore the merchant's arrangement, which is the one
      // thing this whole feature exists to honour.
      .sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0));
  } catch {
    return [];
  }
}

/**
 * Lay the categories out as columns.
 *
 * A category with sub-categories earns its own column, headed by itself. The
 * rest are packed together — a column per childless category would be a wall
 * of one-line columns, and the menu would scroll sideways off a laptop.
 */
function columns(categories) {
  const parents = categories.filter((c) => c.children?.length);
  const singles = categories.filter((c) => !c.children?.length);

  const out = parents.slice(0, MAX_COLUMNS).map((c) => ({
    title: c.name,
    href: url(c.slug),
    links: c.children.map((child) => ({ name: child.name, href: url(child.slug) })),
  }));

  for (let i = 0; i < singles.length && out.length < MAX_COLUMNS; i += PACK_SIZE) {
    out.push({
      title: out.length === 0 ? 'Shop' : 'More',
      href: null,
      links: singles.slice(i, i + PACK_SIZE).map((c) => ({ name: c.name, href: url(c.slug) })),
    });
  }

  return out;
}

function column(col) {
  // The column heading is itself a link when it is a real category. Making the
  // parent unclickable is a common mega-menu mistake: "Dates" is a page people
  // want, not just a label for the things under it.
  const title = col.href
    ? `<a class="mega-menu__col-title" href="${esc(col.href)}"
          style="display:block;text-decoration:none">${esc(col.title)}</a>`
    : `<p class="mega-menu__col-title">${esc(col.title)}</p>`;

  return `<div>${title}${col.links.map(
    (l) => `<a class="mega-menu__link" href="${esc(l.href)}">${esc(l.name)}</a>`
  ).join('')}</div>`;
}

/**
 * The drawer is a flat list, with sub-categories indented under their parent.
 *
 * Not a nested accordion. This is already inside one, and a second level of
 * tap-to-open on a phone means three taps to reach a product listing.
 */
function drawerRows(c) {
  const parent = `<a class="mobile-nav__sublink" href="${esc(url(c.slug))}">${esc(c.name)}</a>`;

  if (!c.children?.length) return parent;

  return parent + c.children.map((child) =>
    `<a class="mobile-nav__sublink" href="${esc(url(child.slug))}"
        style="padding-left:1.5rem;opacity:.85">${esc(child.name)}</a>`).join('');
}

const url = (slug) => `/modules/catalog/category.html?slug=${encodeURIComponent(slug)}`;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
