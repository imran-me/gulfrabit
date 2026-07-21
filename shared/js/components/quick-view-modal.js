/**
 * quick-view-modal — peek a product without leaving the listing.
 * Lazily imported by product-card.js only when a quick-view button is clicked,
 * so it costs nothing on pages that never use it.
 *
 * Self-contained: builds its own dialog, fetches the product via data-service,
 * and reuses the shared cart state + toast.
 */

import { getProductById } from '../core/data-service.js';
import { formatBDT, discountLabel } from '../utils/format-currency.js';
import * as store from '../core/state.js';
import { toast } from './toast-notifications.js';
import { openCartDrawer } from './cart-drawer.js';

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'quickview-host';
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: 'var(--z-modal)', display: 'none' });
  host.innerHTML = `
    <div class="quickview-backdrop" data-qv-close style="position:absolute;inset:0;background:rgba(0,0,0,.66);backdrop-filter:blur(3px)"></div>
    <div class="quickview-dialog surface-gr animate-fade-up" role="dialog" aria-modal="true" aria-label="Product quick view"
         style="position:relative;max-width:860px;width:92vw;margin:8vh auto 0;max-height:84vh;overflow:auto;padding:0"></div>`;
  document.body.appendChild(host);
  host.querySelector('[data-qv-close]').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return host;
}

export async function openQuickView(id) {
  const el = ensureHost();
  const dialog = el.querySelector('.quickview-dialog');
  dialog.innerHTML = `<div style="padding:3rem;text-align:center" class="text-muted-gr">Loading…</div>`;
  el.style.display = 'block';
  document.body.style.overflow = 'hidden';

  const p = await getProductById(id);
  if (!p) { dialog.innerHTML = `<div style="padding:3rem;text-align:center">Product not found.</div>`; return; }

  dialog.innerHTML = `
    <button class="btn-icon-gr" data-qv-close aria-label="Close" style="position:absolute;top:.75rem;right:.75rem;z-index:2;background:var(--gr-graphite)">✕</button>
    <div style="display:grid;grid-template-columns:1fr;gap:0">
      <div style="display:grid;grid-template-columns:1fr;gap:0" class="quickview-grid">
        <img src="${p.image}" alt="${escapeAttr(p.title)}" style="width:100%;height:100%;object-fit:cover;aspect-ratio:1;background:var(--gr-graphite)">
        <div style="padding:2rem">
          ${p.brand ? `<div class="product-card__brand">${escapeHtml(p.brand)}${p.origin ? ' · ' + escapeHtml(p.origin) : ''}</div>` : ''}
          <h2 class="h3" style="margin:.5rem 0 1rem">${escapeHtml(p.title)}</h2>
          <div class="product-card__price-row" style="margin-bottom:1rem">
            <span class="price" style="font-size:var(--fs-25)">${formatBDT(p.price)}</span>
            ${p.originalPrice && p.originalPrice > p.price ? `<span class="price price--strike">${formatBDT(p.originalPrice)}</span> <span class="badge-gr badge-sale">${discountLabel(p.originalPrice, p.price)}</span>` : ''}
          </div>
          <p class="text-muted-gr" style="margin-bottom:1.5rem">${escapeHtml(p.shortDescription || p.description || '')}</p>
          <div style="display:flex;gap:.75rem">
            <button class="btn-gr btn-primary-gr btn-block-gr" data-qv-add ${p.inStock ? '' : 'disabled'}>${p.inStock ? 'Add to Cart' : 'Sold out'}</button>
            <a class="btn-gr btn-outline-gr" href="${window.location.origin}/modules/catalog/product.html?id=${p.id}">Details</a>
          </div>
        </div>
      </div>
    </div>`;

  // Two columns from tablet up.
  const grid = dialog.querySelector('.quickview-grid');
  if (window.matchMedia('(min-width: 768px)').matches) grid.style.gridTemplateColumns = '1fr 1fr';

  dialog.querySelector('[data-qv-close]').addEventListener('click', close);
  dialog.querySelector('[data-qv-add]')?.addEventListener('click', () => {
    if (!p.inStock) return;
    store.addToCart({ id: p.id, title: p.title, brand: p.brand, price: p.price, image: p.image }, 1);
    toast.success(`Added to cart · ${p.title}`);
    close();
    openCartDrawer();
  });
}

function close() {
  if (!host) return;
  host.style.display = 'none';
  document.body.style.overflow = '';
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
