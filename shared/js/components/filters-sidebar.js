/**
 * filters-sidebar — derives facets from a product set and renders filter groups.
 * Shared by the category (PLP) and search pages.
 *
 * initFilters({ host, products, initial, onChange }) -> { getFilters, setFilters, clear }
 *
 * Facets derived: price range, brand, origin, dietary tags, rating, availability.
 * State is plain and serialisable so pages can mirror it into the URL.
 * Also wires the mobile bottom-sheet (via [data-open-filters]).
 */

import { formatBDT } from '../utils/format-currency.js';
import { debounce } from '../utils/debounce.js';

export function initFilters({ host, products, initial = {}, onChange }) {
  const brands = unique(products.map((p) => p.brand));
  const origins = unique(products.map((p) => p.origin));
  const dietary = unique(products.flatMap((p) => p.dietary || []));
  const prices = products.map((p) => p.price);
  const priceMin = Math.floor(Math.min(...prices, 0));
  const priceMax = Math.ceil(Math.max(...prices, 100));

  const onSaleCount = products.filter((p) => p.originalPrice && p.originalPrice > p.price).length;
  // Facet counts so each option shows how many products match.
  const COUNT = {
    brands: (v) => products.filter((p) => p.brand === v).length,
    origins: (v) => products.filter((p) => p.origin === v).length,
    tags: (v) => products.filter((p) => (p.dietary || []).includes(v)).length,
  };

  let filters = normalize(initial);

  host.innerHTML = groupsHTML();
  bind();
  wireMobileSheet(host);

  /** Collapsible group wrapper. */
  function group(title, body, open = true) {
    return `<div class="filter-group">
      <button type="button" class="filter-group__title" data-collapse aria-expanded="${open}">${title}
        <svg class="filter-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="filter-group__body"${open ? '' : ' hidden'}>${body}</div>
    </div>`;
  }

  function groupsHTML() {
    const price = `
      <div class="price-range">
        <input class="input-gr btn-sm-gr" type="number" inputmode="numeric" data-min-price placeholder="${priceMin}" value="${filters.minPrice ?? ''}" min="${priceMin}" max="${priceMax}" aria-label="Minimum price">
        <span class="text-muted-gr">–</span>
        <input class="input-gr btn-sm-gr" type="number" inputmode="numeric" data-max-price placeholder="${priceMax}" value="${filters.maxPrice ?? ''}" min="${priceMin}" max="${priceMax}" aria-label="Maximum price">
      </div>
      <p class="caption" style="margin-top:.5rem">${formatBDT(priceMin)} – ${formatBDT(priceMax)}</p>`;

    const rating = [4, 3, 2].map((r) => `
      <label class="filter-option"><input type="radio" name="rating" value="${r}" ${filters.rating === r ? 'checked' : ''}> ${r}★ &amp; up</label>`).join('');

    const availability = `
      <label class="filter-option"><input type="checkbox" data-instock ${filters.inStock ? 'checked' : ''}> In stock only</label>
      ${onSaleCount ? `<label class="filter-option"><input type="checkbox" data-onsale ${filters.onSale ? 'checked' : ''}> On sale <span class="filter-count">(${onSaleCount})</span></label>` : ''}`;

    return `
      ${group('Price (৳)', price)}
      ${brands.length ? group('Brand', checkList('brands', brands, filters.brands)) : ''}
      ${origins.length ? group('Origin', checkList('origins', origins, filters.origins)) : ''}
      ${dietary.length ? group('Dietary', checkList('tags', dietary, filters.tags)) : ''}
      ${group('Rating', rating)}
      ${group('Availability', availability)}
      <button class="btn-gr btn-ghost-gr btn-sm-gr" data-clear-all type="button" style="margin-top:1rem">Clear all filters</button>`;
  }

  function checkList(key, values, selected = []) {
    return values.map((v) => `
      <label class="filter-option"><input type="checkbox" data-facet="${key}" value="${escapeAttr(v)}" ${selected.includes(v) ? 'checked' : ''}> ${escapeHtml(v)} <span class="filter-count">(${COUNT[key](v)})</span></label>`).join('');
  }

  function bind() {
    const emit = () => onChange?.(getFilters());
    const debouncedEmit = debounce(emit, 300);

    host.querySelector('[data-min-price]')?.addEventListener('input', (e) => { filters.minPrice = numOrNull(e.target.value); debouncedEmit(); });
    host.querySelector('[data-max-price]')?.addEventListener('input', (e) => { filters.maxPrice = numOrNull(e.target.value); debouncedEmit(); });

    host.querySelectorAll('[data-facet]').forEach((cb) => cb.addEventListener('change', () => {
      const key = cb.dataset.facet;
      filters[key] = [...host.querySelectorAll(`[data-facet="${key}"]:checked`)].map((c) => c.value);
      emit();
    }));

    host.querySelectorAll('input[name="rating"]').forEach((r) => r.addEventListener('change', () => { filters.rating = Number(r.value); emit(); }));
    host.querySelector('[data-instock]')?.addEventListener('change', (e) => { filters.inStock = e.target.checked; emit(); });
    host.querySelector('[data-onsale]')?.addEventListener('change', (e) => { filters.onSale = e.target.checked; emit(); });
    host.querySelector('[data-clear-all]')?.addEventListener('click', clear);

    // Collapsible groups
    host.querySelectorAll('[data-collapse]').forEach((btn) => btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      if (btn.nextElementSibling) btn.nextElementSibling.hidden = open;
    }));
  }

  function getFilters() { return pruneEmpty({ ...filters }); }
  function setFilters(next) { filters = normalize(next); host.innerHTML = groupsHTML(); bind(); }
  function clear() { filters = {}; host.innerHTML = groupsHTML(); bind(); onChange?.({}); }

  return { getFilters, setFilters, clear };
}

/* ---- Mobile bottom-sheet ---------------------------------------------
   Moves the REAL filter host into the sheet on open and back on close, so the
   controls stay live (no dead clone) and there's a single source of state. */
function wireMobileSheet(host) {
  const openBtn = document.querySelector('[data-open-filters]');
  if (!openBtn) return;
  let sheet, backdrop, body, placeholder;

  openBtn.addEventListener('click', open);

  function build() {
    backdrop = document.createElement('div');
    backdrop.className = 'filters-sheet-backdrop'; backdrop.hidden = true;
    sheet = document.createElement('div');
    sheet.className = 'filters-sheet';
    sheet.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <h2 class="h5">Filters</h2><button class="btn-icon-gr" data-close-sheet aria-label="Close filters">✕</button></div>
      <div data-sheet-body></div>
      <button class="btn-gr btn-primary-gr btn-block-gr" data-apply-sheet style="margin-top:1rem">Show results</button>`;
    body = sheet.querySelector('[data-sheet-body]');
    document.body.append(backdrop, sheet);
    backdrop.addEventListener('click', close);
    sheet.querySelector('[data-close-sheet]').addEventListener('click', close);
    sheet.querySelector('[data-apply-sheet]').addEventListener('click', close);
  }

  function open() {
    if (!sheet) build();
    // Relocate the live host into the sheet, leaving a placeholder to restore it.
    placeholder = document.createComment('filters-host');
    host.parentNode.insertBefore(placeholder, host);
    body.appendChild(host);
    backdrop.hidden = false;
    requestAnimationFrame(() => { backdrop.style.opacity = '1'; sheet.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
  }

  function close() {
    backdrop.style.opacity = '0';
    sheet.classList.remove('is-open');
    document.body.style.overflow = '';
    // Return the host to its original place.
    if (placeholder) { placeholder.parentNode.insertBefore(host, placeholder); placeholder.remove(); placeholder = null; }
    setTimeout(() => { backdrop.hidden = true; }, 300);
  }
}

/* ---- helpers ---------------------------------------------------------- */
function unique(arr) { return [...new Set(arr.filter(Boolean))].sort(); }
function numOrNull(v) { const n = Number(v); return v === '' || Number.isNaN(n) ? null : n; }
function normalize(f = {}) { return { minPrice: f.minPrice ?? null, maxPrice: f.maxPrice ?? null, brands: f.brands || [], origins: f.origins || [], tags: f.tags || [], rating: f.rating ?? null, inStock: !!f.inStock, onSale: !!f.onSale }; }
function pruneEmpty(f) {
  const out = {};
  if (f.minPrice != null) out.minPrice = f.minPrice;
  if (f.maxPrice != null) out.maxPrice = f.maxPrice;
  if (f.brands?.length) out.brands = f.brands;
  if (f.origins?.length) out.origins = f.origins;
  if (f.tags?.length) out.tags = f.tags;
  if (f.rating != null) out.rating = f.rating;
  if (f.inStock) out.inStock = true;
  if (f.onSale) out.onSale = true;
  return out;
}
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
