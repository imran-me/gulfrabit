/**
 * Catalog · module API — the ONLY door to product and category data.
 *
 * Every consumer imports from here: the PLP, PDP, search, compare, deals, home,
 * b2b and the shared product components. Nothing reaches past it to the JSON,
 * so when the Laravel endpoints land only the bodies below change to `fetch()`
 * — the shapes already match `endpoints.md`.
 *
 *   GET /api/catalog/products            -> { data: Product[], meta }
 *   GET /api/catalog/products/{sku}      -> { data: Product & { related } }
 *   GET /api/catalog/suggest?q=          -> { data: Suggestion[] }
 *   GET /api/catalog/deals?limit=        -> { data: Product[] }
 *   GET /api/catalog/categories          -> { data: Category[] }
 *   GET /api/catalog/categories/{slug}   -> { data: Category }
 *
 * Filtering and sorting run in memory here because the mock catalog is 44 SKUs.
 * The server does NOT do it that way — see Services/ProductQueryService.php,
 * which pushes both into SQL. Keep the two in agreement when either changes.
 */

import { loadJSON } from '../../../shared/js/core/json-cache.js';
import { siteURL } from '../../../shared/js/core/paths.js';

// Catalog owns its data. Moved out of the old global /data bucket 2026-07-26.

/* ---- Live API, with the JSON files as the fallback ---------------------
 *
 * The Laravel API is now the source of truth. These JSON files remain as the
 * fallback for two situations, and only two: local development with no PHP
 * running, and a backend outage — where showing yesterday's catalogue beats
 * showing an error page to somebody trying to buy something.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS
 * The admin panel writes to the database. Until this seam read from it, a
 * merchant switching a category off changed the database and the shop carried
 * on selling from a JSON file — the panel and the site disagreeing, with no
 * error anywhere to say so.
 *
 * The fallback is a read of public catalogue data, so unlike the admin
 * fixture it carries no security weight: the worst case is a stale price,
 * which the checkout recomputes server-side anyway.
 */
let apiAlive = null;   // null = untried, true/false once known

async function fromApi(path) {
  if (apiAlive === false) return null;

  try {
    const res = await fetch(siteURL(`api/catalog${path}`), { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      // A 404 means no PHP is serving /api — remember it, so every subsequent
      // call on this page goes straight to the JSON instead of paying for a
      // round trip that will fail the same way.
      if (res.status === 404) apiAlive = false;
      return null;
    }
    apiAlive = true;
    return (await res.json()).data;
  } catch {
    apiAlive = false;
    return null;
  }
}

const PRODUCTS_URL   = siteURL('modules/catalog/data/products.json');
const CATEGORIES_URL = siteURL('modules/catalog/data/categories.json');

/* ---- Products ---------------------------------------------------------- */

/**
 * Every product read in the storefront goes through here — category pages,
 * search, the suggest dropdown, deals, related rails and the home shelves all
 * call it — which makes it the one place the active flag has to be applied.
 *
 * Same shape as getCategories() below, and for the same reason: the API has
 * already filtered server-side, the JSON file has not. Shipping the raw file
 * would put every parked product back into search the moment PHP is not
 * serving /api, and "turned off" has to mean gone from the whole shop, not
 * gone from the category page it used to sit on.
 */
export async function getAllProducts() {
  const live = await fromApi('/products');
  if (live) return live.filter(isActive);

  const { products } = await loadJSON(PRODUCTS_URL);
  return products.filter(isActive);
}

export async function getProductById(id) {
  const products = await getAllProducts();
  return products.find((p) => String(p.id) === String(id)) ?? null;
}

export async function getProductsByCategory(slug, { sort, filters, limit } = {}) {
  let products = (await getAllProducts()).filter((p) => p.categorySlug === slug);
  products = applyFilters(products, filters);
  products = applySort(products, sort);
  return typeof limit === 'number' ? products.slice(0, limit) : products;
}

export async function getFeatured(tag = 'featured', limit = 8) {
  const products = await getAllProducts();
  return products.filter((p) => p.tags?.includes(tag)).slice(0, limit);
}

/** Discounted products, deepest percentage saving first. */
export async function getDeals(limit) {
  const products = await getAllProducts();
  const deals = products
    .filter((p) => p.originalPrice && p.originalPrice > p.price)
    .map((p) => ({ ...p, _pct: Math.round((p.originalPrice - p.price) / p.originalPrice * 100) }))
    .sort((a, b) => b._pct - a._pct);
  return typeof limit === 'number' ? deals.slice(0, limit) : deals;
}

export async function getRelated(product, limit = 6) {
  const products = await getAllProducts();
  return products
    .filter((p) => p.categorySlug === product.categorySlug && p.id !== product.id)
    .slice(0, limit);
}

export async function searchProducts(query, { sort, filters } = {}) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  let results = (await getAllProducts()).filter((p) => matchesQuery(p, q));
  results = applyFilters(results, filters);
  results = applySort(results, sort);
  return results;
}

/**
 * Does this product answer the query?
 *
 * Two different matching rules on purpose:
 *
 *  · **Free text** (title, brand, origin, category) matches on SUBSTRING, so a
 *    half-typed word still finds things — typing "choc" should reach chocolate.
 *
 *  · **searchTerms** matches on WHOLE WORDS only. These are curated synonyms
 *    and romanised Bangla ("khejur", "modhu", "chaku"), and substring matching
 *    them is actively harmful: "cha" (Bangla for tea) would match "chocolate",
 *    "chashew" and anything else containing those three letters, and the
 *    synonym list would start returning nonsense.
 */
function matchesQuery(p, q) {
  const freeText = [p.title, p.brand, p.origin, p.categoryName, ...(p.tags || [])]
    .filter(Boolean).join(' ').toLowerCase();
  if (freeText.includes(q)) return true;

  return (p.searchTerms || []).some((term) =>
    term === q || term.split(' ').includes(q) || term.startsWith(`${q} `));
}

/**
 * Autocomplete. Title and brand only — deliberately narrower than search, so
 * the dropdown stays predictable instead of matching description prose.
 */
export async function suggest(query, limit = 6) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const products = await getAllProducts();
  return products
    .filter((p) => p.title.toLowerCase().includes(q)
      || p.brand?.toLowerCase().includes(q)
      // Synonyms count here too, or "khejur" returns nothing in the dropdown
      // while returning results on the full search page — an inconsistency the
      // customer experiences as the search being broken.
      || (p.searchTerms || []).some((t) => t === q || t.split(' ').includes(q) || t.startsWith(`${q} `)))
    .slice(0, limit)
    .map((p) => ({ id: p.id, title: p.title, brand: p.brand, image: p.image, categorySlug: p.categorySlug }));
}

/* ---- Categories -------------------------------------------------------- */

/**
 * The categories the storefront is allowed to show.
 *
 * The API has already applied ->active() server-side, so what comes back is
 * live-only. The JSON fallback has not been filtered by anyone, which is why
 * the same rule is applied here: categories.json carries the full set — the
 * eight non-food categories are parked, not deleted — and shipping the raw file
 * would put Fashion and Industrial back in the menu the moment PHP is not
 * serving /api. Absent flag means on, so a category added without one behaves
 * the way whoever added it expected.
 */
export async function getCategories() {
  const live = await fromApi('/categories');
  if (live) return live.filter(isActive);

  const { categories } = await loadJSON(CATEGORIES_URL);
  return categories.filter(isActive);
}

/**
 * Shared by categories and products. Absent flag means on, so a row added
 * without one behaves the way whoever added it expected. Declared here rather
 * than beside getAllProducts because both callers are equal owners of it —
 * `const` is fine below its first caller since nothing runs at import time.
 */
const isActive = (c) => c.active !== false && c.isActive !== false;

export async function getCategoryBySlug(slug) {
  const categories = await getCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

/* ---- Filtering / sorting ----------------------------------------------- */

function applyFilters(products, filters) {
  if (!filters) return products;
  return products.filter((p) => {
    if (filters.minPrice != null && p.price < filters.minPrice) return false;
    if (filters.maxPrice != null && p.price > filters.maxPrice) return false;
    if (filters.brands?.length && !filters.brands.includes(p.brand)) return false;
    if (filters.origins?.length && !filters.origins.includes(p.origin)) return false;
    if (filters.rating != null && (p.rating ?? 0) < filters.rating) return false;
    if (filters.inStock && !p.inStock) return false;
    if (filters.tags?.length && !filters.tags.some((t) => p.tags?.includes(t))) return false;
    return true;
  });
}

function applySort(products, sort) {
  const list = products.slice();
  switch (sort) {
    case 'price-asc':  return list.sort((a, b) => a.price - b.price);
    case 'price-desc': return list.sort((a, b) => b.price - a.price);
    case 'newest':     return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    case 'rating':     return list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    case 'featured':
    default:           return list.sort((a, b) => (b.tags?.includes('featured') ? 1 : 0) - (a.tags?.includes('featured') ? 1 : 0));
  }
}
