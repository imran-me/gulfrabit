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
const PRODUCTS_URL   = siteURL('modules/catalog/data/products.json');
const CATEGORIES_URL = siteURL('modules/catalog/data/categories.json');

/* ---- Products ---------------------------------------------------------- */

export async function getAllProducts() {
  const { products } = await loadJSON(PRODUCTS_URL);
  return products;
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
  let results = (await getAllProducts()).filter((p) =>
    [p.title, p.brand, p.origin, p.categoryName, ...(p.tags || [])]
      .filter(Boolean).join(' ').toLowerCase().includes(q));
  results = applyFilters(results, filters);
  results = applySort(results, sort);
  return results;
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
    .filter((p) => p.title.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q))
    .slice(0, limit)
    .map((p) => ({ id: p.id, title: p.title, brand: p.brand, image: p.image, categorySlug: p.categorySlug }));
}

/* ---- Categories -------------------------------------------------------- */

export async function getCategories() {
  const { categories } = await loadJSON(CATEGORIES_URL);
  return categories;
}

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
