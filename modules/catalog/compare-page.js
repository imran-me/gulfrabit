/**
 * compare-page.js — side-by-side product comparison table.
 * Reads the compare selection from shared state, resolves products, and renders
 * a table (price, rating, brand, origin, availability, union of specs). Best
 * price / rating are highlighted. Re-renders live as items are removed.
 */
import * as store from '../../shared/js/core/state.js';
import { getAllProducts } from '../../shared/js/core/data-service.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { siteURL } from '../../shared/js/core/paths.js';
import { toast } from '../../shared/js/components/toast-notifications.js';
import { openCartDrawer } from '../../shared/js/components/cart-drawer.js';

const root = document.querySelector('[data-compare-root]');
const emptyEl = document.querySelector('[data-compare-empty]');
const clearBtn = document.querySelector('[data-clear-all]');

let index = null;

init();

async function init() {
  const all = await getAllProducts().catch(() => []);
  index = new Map(all.map((p) => [p.id, p]));
  clearBtn.addEventListener('click', () => store.clearCompare());
  store.subscribe(store.EVENTS.COMPARE, render);
  render();
}

function render() {
  const items = store.getCompare().map((id) => index.get(id)).filter(Boolean);
  if (!items.length) { root.innerHTML = ''; emptyEl.hidden = false; clearBtn.hidden = true; return; }
  emptyEl.hidden = true;
  clearBtn.hidden = false;

  const minPrice = Math.min(...items.map((p) => p.price));
  const maxRating = Math.max(...items.map((p) => p.rating || 0));
  // Union of spec keys across the selection.
  const specKeys = [...new Set(items.flatMap((p) => Object.keys(p.specs || {})))];

  const col = (p) => `<th class="compare-col">
      <div class="compare-col__media">
        <img src="${p.image}" alt="${attr(p.title)}" loading="lazy">
        <button class="btn-icon-gr compare-col__remove" data-remove="${p.id}" aria-label="Remove" style="background:var(--gr-graphite)">✕</button>
      </div>
      <a href="${siteURL(`modules/catalog/product.html?id=${p.id}`)}"><strong>${esc(p.title)}</strong></a>
    </th>`;

  const priceCell = (p) => `<td class="tabular ${p.price === minPrice ? 'compare-best' : ''}">${formatBDT(p.price)}${p.price === minPrice ? ' · best' : ''}</td>`;
  const ratingCell = (p) => `<td class="${(p.rating || 0) === maxRating ? 'compare-best' : ''}">${(p.rating || 0)}★ <span class="caption">(${p.reviewCount || 0})</span></td>`;
  const row = (label, cell) => `<tr><td class="compare-table__row-label">${label}</td>${items.map(cell).join('')}</tr>`;

  root.innerHTML = `
    <table class="compare-table">
      <thead><tr><td class="compare-table__row-label"></td>${items.map(col).join('')}</tr></thead>
      <tbody>
        ${row('Price', priceCell)}
        ${row('Rating', ratingCell)}
        ${row('Brand', (p) => `<td>${esc(p.brand || '—')}</td>`)}
        ${row('Origin', (p) => `<td>${esc(p.origin || '—')}</td>`)}
        ${row('Availability', (p) => `<td>${p.inStock ? '<span style="color:var(--gr-lime)">In stock</span>' : '<span style="color:var(--gr-error)">Out of stock</span>'}</td>`)}
        ${specKeys.map((k) => row(esc(k), (p) => `<td>${esc(String(p.specs?.[k] ?? '—'))}</td>`)).join('')}
        ${row('', (p) => `<td><button class="btn-gr btn-primary-gr btn-sm-gr btn-block-gr" data-add="${p.id}" ${p.inStock ? '' : 'disabled'}>${p.inStock ? 'Add to Cart' : 'Sold out'}</button></td>`)}
      </tbody>
    </table>`;

  root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => store.removeFromCompare(b.dataset.remove)));
  root.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
    const p = index.get(b.dataset.add);
    store.addToCart({ id: p.id, title: p.title, brand: p.brand, price: p.price, image: p.image }, 1);
    toast.success(`Added to cart · ${p.title}`);
    openCartDrawer();
  }));
}

function esc(s = '') { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function attr(s = '') { return String(s).replace(/"/g, '&quot;'); }
