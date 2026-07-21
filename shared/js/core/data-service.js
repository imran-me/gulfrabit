/**
 * data-service — THE single point of contact for catalog data.
 *
 * Right now it reads the mock JSON in /data. When the Laravel REST API is ready,
 * change ONLY the fetch URLs / shape-mapping in this file — every page and
 * component keeps calling the same functions and never touches fetch directly.
 *
 * See shared/backend/api-contract.md and each modules/<x>/backend/endpoints.md
 * for the endpoints these will map onto.
 */

// Base path to the mock JSON. Resolved relative to THIS module's URL so it works
// at a domain root or a project subpath (github.io/repo/). When wiring the
// backend, swap for API_BASE. shared/js/core/ -> up 3 -> <root>/data.
const DATA_BASE = new URL('../../../data', import.meta.url).href;
// const API_BASE = 'https://api.gulfrabit.com/v1';   // TODO: backend

// Simple in-memory cache so we fetch each JSON file once per page load.
const cache = new Map();

async function loadJSON(name) {
  if (cache.has(name)) return cache.get(name);
  const url = `${DATA_BASE}/${name}.json`;
  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${name}.json (${res.status})`);
      return res.json();
    })
    .catch((err) => { cache.delete(name); throw err; });
  cache.set(name, promise);
  return promise;
}

/** Simulate network latency so skeleton/loading states are actually visible. */
function withDelay(value, ms = 350) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/* ---- Products ---------------------------------------------------------- */
export async function getAllProducts() {
  const { products } = await loadJSON('products');
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

/** Lightweight autocomplete suggestions (titles + categories). */
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
  const { categories } = await loadJSON('categories');
  return categories;
}

export async function getCategoryBySlug(slug) {
  const categories = await getCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

/* ---- Orders / users (mock) -------------------------------------------- */
export async function getMockOrders() {
  const { orders } = await loadJSON('orders');
  return orders;
}

export async function getMockUsers() {
  const { users } = await loadJSON('users');
  return users;
}

/* ---- Filtering / sorting helpers -------------------------------------- */
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

export const dataService = {
  getAllProducts, getProductById, getProductsByCategory, getFeatured, getRelated,
  searchProducts, suggest, getCategories, getCategoryBySlug, getMockOrders, getMockUsers,
  withDelay,
};
