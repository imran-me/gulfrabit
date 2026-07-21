/**
 * category-page.js — glue for category.html (PLP).
 * Reads ?slug= from the URL, loads that category + its products, renders the
 * filters sidebar, applies filter/sort state (mirrored to the URL), and paints
 * the grid with skeletons → data. "Load more" paginates client-side.
 */

import { getCategoryBySlug, getProductsByCategory } from '../../shared/js/core/data-service.js';
import { renderProductGrid } from '../../shared/js/components/product-card.js';
import { renderProductSkeletons } from '../../shared/js/components/skeleton-loader.js';
import { initFilters } from '../../shared/js/components/filters-sidebar.js';
import { getParam, getParams, setParams } from '../../shared/js/core/router-helpers.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';

const PAGE_SIZE = 8;
const grid = document.querySelector('[data-product-grid]');
const countEl = document.querySelector('[data-result-count]');
const emptyEl = document.querySelector('[data-empty]');
const loadMoreBtn = document.querySelector('[data-load-more]');
const chipsEl = document.querySelector('[data-active-chips]');
const sortSel = document.querySelector('[data-sort]');

let all = [];        // full category product set
let filtered = [];   // after filters+sort
let shown = 0;
let filtersApi = null;

init();

async function init() {
  const slug = getParam('slug', 'imported-food-grocery');
  const params = getParams();
  if (params.sort && sortSel) sortSel.value = params.sort;

  renderProductSkeletons(grid, PAGE_SIZE);

  const [category, products] = await Promise.all([
    getCategoryBySlug(slug),
    getProductsByCategory(slug),
  ]);

  paintHeader(category, slug);
  all = products;

  // Build filters from the category's products.
  const initialFilters = parseFiltersFromURL(params);
  filtersApi = initFilters({
    host: document.querySelector('[data-filters-host]'),
    products: all,
    initial: initialFilters,
    onChange: (f) => { applyAndRender(f); syncURL(); },
  });

  document.querySelector('[data-clear-filters]')?.addEventListener('click', () => { filtersApi.clear(); });
  sortSel?.addEventListener('change', () => { applyAndRender(filtersApi.getFilters()); syncURL(); });
  loadMoreBtn?.addEventListener('click', () => { shown += PAGE_SIZE; paintGrid(); });

  applyAndRender(initialFilters);
}

function paintHeader(category, slug) {
  const title = category?.name || slug.replace(/-/g, ' ');
  document.querySelector('[data-cat-title]').textContent = title;
  document.querySelector('[data-crumb-category]').textContent = title;
  document.querySelector('[data-cat-blurb]').textContent = category?.blurb || '';
  document.querySelector('[data-cat-audience]').textContent = category?.audience === 'b2b' ? 'For Industry' : 'Shop';
  document.title = `${title} — GulfRabit`;
}

function applyAndRender(filters) {
  const sort = sortSel?.value || 'featured';
  filtered = sortProducts(applyClientFilters(all, filters), sort);
  shown = PAGE_SIZE;
  renderChips(filters);
  paintGrid();
}

function paintGrid() {
  countEl.textContent = `${filtered.length} product${filtered.length === 1 ? '' : 's'}`;
  if (!filtered.length) { grid.innerHTML = ''; emptyEl.hidden = false; loadMoreBtn.hidden = true; return; }
  emptyEl.hidden = true;
  renderProductGrid(grid, filtered.slice(0, shown));
  loadMoreBtn.hidden = shown >= filtered.length;
}

/* ---- Local filter/sort (mirrors data-service so we filter in memory) -- */
function applyClientFilters(products, f = {}) {
  return products.filter((p) => {
    if (f.minPrice != null && p.price < f.minPrice) return false;
    if (f.maxPrice != null && p.price > f.maxPrice) return false;
    if (f.brands?.length && !f.brands.includes(p.brand)) return false;
    if (f.origins?.length && !f.origins.includes(p.origin)) return false;
    if (f.tags?.length && !f.tags.some((t) => (p.dietary || []).includes(t))) return false;
    if (f.rating != null && (p.rating ?? 0) < f.rating) return false;
    if (f.inStock && !p.inStock) return false;
    return true;
  });
}
function sortProducts(list, sort) {
  const arr = list.slice();
  switch (sort) {
    case 'price-asc': return arr.sort((a, b) => a.price - b.price);
    case 'price-desc': return arr.sort((a, b) => b.price - a.price);
    case 'newest': return arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    case 'rating': return arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    default: return arr.sort((a, b) => (b.tags?.includes('featured') ? 1 : 0) - (a.tags?.includes('featured') ? 1 : 0));
  }
}

/* ---- Active-filter chips --------------------------------------------- */
function renderChips(f = {}) {
  const chips = [];
  if (f.minPrice != null || f.maxPrice != null) chips.push(chip('price', `${f.minPrice != null ? formatBDT(f.minPrice) : '৳0'}–${f.maxPrice != null ? formatBDT(f.maxPrice) : 'max'}`));
  (f.brands || []).forEach((b) => chips.push(chip('brand', b)));
  (f.origins || []).forEach((o) => chips.push(chip('origin', o)));
  (f.tags || []).forEach((t) => chips.push(chip('tag', t)));
  if (f.rating != null) chips.push(chip('rating', `${f.rating}★ & up`));
  if (f.inStock) chips.push(chip('stock', 'In stock'));
  chipsEl.innerHTML = chips.join('');
  if (chips.length) chipsEl.insertAdjacentHTML('beforeend', `<button class="chip" data-clear-chip style="cursor:pointer">Clear all ✕</button>`);
  chipsEl.querySelector('[data-clear-chip]')?.addEventListener('click', () => filtersApi.clear());
}
function chip(label, val) { return `<span class="chip">${label}: ${escapeHtml(String(val))}</span>`; }

/* ---- URL sync --------------------------------------------------------- */
function syncURL() {
  const f = filtersApi.getFilters();
  setParams({
    slug: getParam('slug'),
    sort: sortSel?.value === 'featured' ? null : sortSel?.value,
    minPrice: f.minPrice ?? null,
    maxPrice: f.maxPrice ?? null,
    brands: f.brands || null,
    origins: f.origins || null,
    tags: f.tags || null,
    rating: f.rating ?? null,
    inStock: f.inStock ? '1' : null,
  });
}
function parseFiltersFromURL(p) {
  const f = {};
  if (p.minPrice) f.minPrice = Number(p.minPrice);
  if (p.maxPrice) f.maxPrice = Number(p.maxPrice);
  if (p.brands) f.brands = p.brands.split(',');
  if (p.origins) f.origins = p.origins.split(',');
  if (p.tags) f.tags = p.tags.split(',');
  if (p.rating) f.rating = Number(p.rating);
  if (p.inStock) f.inStock = true;
  return f;
}
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
