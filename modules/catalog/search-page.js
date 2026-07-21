/**
 * search-page.js — glue for search-results.html.
 * Reads ?q=, echoes the query, runs the search, and reuses the same
 * filters/sort/grid pattern as the PLP.
 */

import { searchProducts } from '../../shared/js/core/data-service.js';
import { renderProductGrid } from '../../shared/js/components/product-card.js';
import { renderProductSkeletons } from '../../shared/js/components/skeleton-loader.js';
import { initFilters } from '../../shared/js/components/filters-sidebar.js';
import { getParam } from '../../shared/js/core/router-helpers.js';

const grid = document.querySelector('[data-product-grid]');
const countEl = document.querySelector('[data-result-count]');
const emptyEl = document.querySelector('[data-empty]');
const sortSel = document.querySelector('[data-sort]');

let base = [];      // raw search hits
let filtersApi = null;

init();

async function init() {
  const q = (getParam('q', '') || '').trim();
  document.querySelector('[data-query]').textContent = q || '—';
  document.title = q ? `“${q}” — GulfRabit Search` : 'Search — GulfRabit';

  if (!q) { countEl.textContent = 'Type a search term to begin.'; emptyEl.hidden = false; return; }

  renderProductSkeletons(grid, 8);
  base = await searchProducts(q);

  if (!base.length) { grid.innerHTML = ''; countEl.textContent = '0 results'; emptyEl.hidden = false; return; }

  filtersApi = initFilters({
    host: document.querySelector('[data-filters-host]'),
    products: base,
    onChange: () => render(),
  });
  sortSel?.addEventListener('change', render);
  render();
}

function render() {
  const f = filtersApi ? filtersApi.getFilters() : {};
  let list = base.filter((p) => {
    if (f.minPrice != null && p.price < f.minPrice) return false;
    if (f.maxPrice != null && p.price > f.maxPrice) return false;
    if (f.brands?.length && !f.brands.includes(p.brand)) return false;
    if (f.origins?.length && !f.origins.includes(p.origin)) return false;
    if (f.tags?.length && !f.tags.some((t) => (p.dietary || []).includes(t))) return false;
    if (f.rating != null && (p.rating ?? 0) < f.rating) return false;
    if (f.inStock && !p.inStock) return false;
    if (f.onSale && !(p.originalPrice && p.originalPrice > p.price)) return false;
    return true;
  });
  const sort = sortSel?.value || 'featured';
  if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  else if (sort === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  countEl.textContent = `${list.length} result${list.length === 1 ? '' : 's'}`;
  if (!list.length) { grid.innerHTML = ''; emptyEl.hidden = false; return; }
  emptyEl.hidden = true;
  renderProductGrid(grid, list);
}
