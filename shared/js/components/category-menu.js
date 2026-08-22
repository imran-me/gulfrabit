import { categoryURL } from '../core/paths.js';
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
 * The Shop column grid, the drawer's category list, the footer's Shop list,
 * and the category shortcuts in the top bar. The fixed items — Deals, About,
 * Track Order, My Account — are hand-authored and stay hand-authored. They are
 * not categories, and a "menu manager" that let someone delete My Account from
 * the header would be a footgun, not a feature.
 *
 * The shortcuts were the exception until they were the bug. They were three
 * hand-typed links, so ticking "In menu" in the admin panel could not put a
 * category in the one part of the header that is visible without opening
 * anything — and two of the three had gone on pointing at categories that no
 * longer existed, which is a 404 in a promoted position.
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

/**
 * Categories whose real destination is not their category page.
 *
 * Flash Sale is a category so the merchant can switch it on and off with the
 * others, but its listing would be empty — the discounted products live in
 * every other category. The deals page is the page that actually answers what
 * the row promises, and is where the home-page tile has always pointed.
 */
const PROMO_HREF = {
  'flash-sale': '/deals',
};

/** Most columns the mega-menu can hold before it overflows the viewport. */
const MAX_COLUMNS = 4;

/** Links per column when packing categories that have no sub-categories. */
const PACK_SIZE = 5;

export function initCategoryMenu() {
  const grid = document.querySelector('[data-mega-grid]');
  const drawer = document.querySelector('[data-mobile-shop]');
  const footer = document.querySelector('[data-footer-shop]');
  const slots = [...document.querySelectorAll('[data-nav-slot]')];

  if (!grid && !drawer && !footer && !slots.length) return;

  load().then((categories) => {
    // An empty list is not the same as a failed request. It means every
    // category is switched off, which is a real state — but blanking the menu
    // over it would look like a broken site, so the authored markup stays.
    if (!categories.length) return;

    if (grid) grid.innerHTML = columns(categories).map(column).join('');
    if (drawer) drawer.innerHTML = categories.map(drawerRows).join('');
    if (footer) footerRows(footer, categories);
    if (slots.length) shortcuts(slots, categories);
  });
}

/**
 * The category shortcuts in the top bar.
 *
 * FIXED SLOTS, NOT A REWRITTEN LIST. The bar's width is measured, not
 * flexible: the whole row is hidden below 1580px because that is the width at
 * which it stops fitting, and the figure was arrived at by measuring the row
 * as authored (see the note by .nav-item-optional in gulfrabit.css). A list
 * this filled freely would put five categories in a row sized for three and
 * push the search field off the edge on exactly the wide screens the row
 * exists for. So the markup owns how many there are, and this owns which.
 *
 * A slot with no category left to show is hidden rather than emptied — an
 * empty .nav-item still takes its gap, and three of those look like the header
 * failed to load.
 *
 * Flash Sale is skipped: it is already a fixed item in the bar, in its own
 * colour, and listing it twice is the kind of small wrongness that makes a
 * header look unfinished.
 */
function shortcuts(slots, categories) {
  const promoted = categories.filter((c) => !PROMO_HREF[c.slug]);

  slots.forEach((slot, i) => {
    const category = promoted[i];

    if (!category) {
      slot.hidden = true;
      return;
    }

    const href = url(category.slug);

    // header-nav.js marks the current page on load, which is before these
    // exist. Rather than make that module wait on this one — the nav must not
    // depend on the API being up — the same one-line test is applied here, to
    // the only links that arrive late.
    const here = (location.pathname + location.search).includes(category.slug);

    slot.hidden = false;
    slot.innerHTML = `<a class="nav-link" href="${esc(href)}"
      data-nav-match="${esc(category.slug)}"${here ? ' aria-current="page"' : ''}>${esc(category.name)}</a>`;
  });
}

/**
 * The footer's Shop list, from the same source as the header.
 *
 * It was hand-authored HTML, which meant a category switched on in the admin
 * appeared in the drawer and the mega-menu and simply never reached the
 * footer — three lists, two of them live, and no way to notice the third had
 * drifted except by counting.
 *
 * Rows marked [data-footer-keep] survive: Flash Sale is a promo pointing at
 * the deals page, not a category, and it must not be swept away by a rewrite
 * of the categories around it.
 */
function footerRows(list, categories) {
  const kept = [...list.querySelectorAll('[data-footer-keep]')];
  // A kept row names the slug it already stands for, so the category it
  // represents is not then listed a second time underneath it. Flash Sale was
  // exactly that: an authored promo row AND a live category with the same
  // name, one above the other.
  const covered = new Set(kept.map((li) => li.dataset.footerKeep).filter(Boolean));

  list.innerHTML = kept.map((li) => li.outerHTML).join('') + categories
    .filter((c) => !covered.has(c.slug))
    .map((c) => `<li><a href="${esc(url(c.slug))}">${esc(c.name)}</a></li>`)
    .join('');
}

async function load() {
  try {
    const res = await fetch('/api/catalog/categories', {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) return [];

    const { data } = await res.json();

    return (Array.isArray(data) ? data : [])
      // is_active is applied server-side, but this endpoint is also read by the
      // static build, and a category that is off must never reappear in the
      // navigation just because one of the two paths forgot to check.
      .filter((c) => c.active !== false && c.isActive !== false)
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
      // Only the first packed column is headed. A second "More" beside the
      // first reads as two different things; an empty heading keeps the
      // columns on one baseline and says nothing twice.
      title: i > 0 ? '' : (out.length === 0 ? 'Shop' : 'More'),
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
    // An unheaded column still needs the heading's height, or its first link
    // sits a line above the column next to it.
    : `<p class="mega-menu__col-title" ${col.title ? '' : 'aria-hidden="true"'}>${esc(col.title) || '&nbsp;'}</p>`;

  return `<div>${title}${col.links.map(
    (l) => `<a class="mega-menu__link" href="${esc(l.href)}">${esc(l.name)}</a>`
  ).join('')}</div>`;
}

/**
 * The drawer is one flat list of top-level categories — one tap from opening
 * the menu to a product listing.
 *
 * Sub-categories are deliberately not here. They used to be, indented under
 * their parent, and on a 208px rail that turned ten rows into nineteen with
 * half of them reading as a second-class version of the row above. The parent
 * page lists its children at the top of the listing; that is where they are
 * useful.
 *
 * --i drives the staggered entrance in _navigation.css. It is 1-based and
 * continues past the list, so the account rows below it stay in sequence.
 */
function drawerRows(c, i) {
  return `<li style="--i:${i + 1}">
      <a class="mobile-nav__link" href="${esc(url(c.slug))}">${esc(c.name)}</a>
    </li>`;
}

const url = (slug) => PROMO_HREF[slug]
  ?? categoryURL(slug);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
