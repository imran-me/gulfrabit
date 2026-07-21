/**
 * deals-page.js — the Deals & Offers page.
 * Loads all discounted products, shows the biggest-discount highlights and a
 * sortable grid of everything on sale.
 */
import { getDeals } from '../../shared/js/core/data-service.js';
import { renderProductGrid } from '../../shared/js/components/product-card.js';
import { renderProductSkeletons } from '../../shared/js/components/skeleton-loader.js';

const topEl = document.querySelector('[data-top-deals]');
const allEl = document.querySelector('[data-all-deals]');
const emptyEl = document.querySelector('[data-deals-empty]');
const sortSel = document.querySelector('[data-sort]');

let deals = [];

init();

async function init() {
  renderProductSkeletons(topEl, 4);
  renderProductSkeletons(allEl, 8);
  deals = await getDeals();

  document.querySelector('[data-deal-count]').textContent = deals.length;

  if (!deals.length) { topEl.closest('section').hidden = true; allEl.innerHTML = ''; emptyEl.hidden = false; return; }

  renderProductGrid(topEl, deals.slice(0, 4));
  sortSel?.addEventListener('change', renderAll);
  renderAll();
}

function renderAll() {
  const sort = sortSel?.value || 'discount';
  const list = deals.slice();
  if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  else if (sort === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else list.sort((a, b) => (b._pct || 0) - (a._pct || 0));
  renderProductGrid(allEl, list);
}
