/**
 * product-page.js — glue for product.html (PDP).
 * Reads ?id=, loads the product, fills the gallery/info/tabs, wires add-to-cart
 * and quantity, and renders related products. Industrial/B2B products get a
 * spec-sheet table and read as B2B rather than lifestyle.
 */

import { getProductById, getRelated } from '../../shared/js/core/data-service.js';
import { formatBDT, discountLabel } from '../../shared/js/utils/format-currency.js';
import * as store from '../../shared/js/core/state.js';
import { toast } from '../../shared/js/components/toast-notifications.js';
import { openCartDrawer } from '../../shared/js/components/cart-drawer.js';
import { renderProductGrid } from '../../shared/js/components/product-card.js';
import { setup as setupStepper } from '../../shared/js/components/quantity-stepper.js';
import { initWishlistButtons } from '../../shared/js/components/wishlist.js';
import { getParam } from '../../shared/js/core/router-helpers.js';

const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
let currentQty = 1;

init();

async function init() {
  const id = getParam('id');
  const product = id ? await getProductById(id) : null;
  if (!product) return renderNotFound();

  document.title = `${product.title} — GulfRabit`;
  injectProductSchema(product);
  paintGallery(product);
  paintInfo(product);
  paintTabs(product);
  wireActions(product);
  loadRelated(product);
}

/**
 * Inject Product structured data (schema.org) for rich results. Enhancement
 * only — the human-readable detail is already in the DOM.
 */
function injectProductSchema(p) {
  const origin = window.location.origin;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    image: [origin + (p.images?.[0] || p.image)],
    description: p.shortDescription || p.description || '',
    sku: p.id,
    brand: { '@type': 'Brand', name: p.brand || 'GulfRabit' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BDT',
      price: p.price,
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${origin}/modules/catalog/product.html?id=${p.id}`,
    },
  };
  if (p.rating && p.reviewCount) {
    schema.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviewCount };
  }
  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.textContent = JSON.stringify(schema);
  document.head.appendChild(el);
}

function paintGallery(p) {
  const main = document.querySelector('[data-gallery-main]');
  const thumbs = document.querySelector('[data-gallery-thumbs]');
  const images = p.images?.length ? p.images : [p.image];
  main.innerHTML = `<img src="${images[0]}" alt="${escapeAttr(p.title)}" data-main-img>`;
  thumbs.innerHTML = images.map((src, i) => `
    <button class="gallery__thumb ${i === 0 ? 'is-active' : ''}" data-thumb aria-label="View image ${i + 1}"><img src="${src}" alt=""></button>`).join('');
  thumbs.querySelectorAll('[data-thumb]').forEach((btn, i) => btn.addEventListener('click', () => {
    main.querySelector('[data-main-img]').src = images[i];
    thumbs.querySelectorAll('[data-thumb]').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
  }));
}

function paintInfo(p) {
  const badges = [];
  if (p.tags?.includes('premium')) badges.push('<span class="badge-gr badge-premium">Premium</span>');
  if (p.originalPrice > p.price) badges.push(`<span class="badge-gr badge-sale">${discountLabel(p.originalPrice, p.price)}</span>`);
  if (p.tags?.includes('new')) badges.push('<span class="badge-gr badge-new">New</span>');
  if (p.tags?.includes('b2b')) badges.push('<span class="badge-gr badge-origin">B2B</span>');
  document.querySelector('[data-pdp-badges]').innerHTML = badges.join('');

  document.querySelector('[data-pdp-brand]').textContent = [p.brand, p.origin].filter(Boolean).join(' · ');
  document.querySelector('[data-pdp-title]').textContent = p.title;
  document.querySelector('[data-crumb-title]').textContent = p.title;
  const crumbCat = document.querySelector('[data-crumb-cat]');
  crumbCat.textContent = p.categoryName; crumbCat.href = `/modules/catalog/category.html?slug=${p.categorySlug}`;

  const full = Math.round(p.rating || 0);
  document.querySelector('[data-pdp-rating]').innerHTML =
    `<span style="color:var(--gr-lime)">${STAR.repeat(full)}</span><span style="color:var(--gr-border)">${STAR.repeat(5 - full)}</span><span class="caption">${p.rating || 0} · ${p.reviewCount || 0} reviews</span>`;

  document.querySelector('[data-pdp-price]').textContent = formatBDT(p.price);
  document.querySelector('[data-pdp-original]').textContent = p.originalPrice > p.price ? formatBDT(p.originalPrice) : '';
  document.querySelector('[data-pdp-discount]').innerHTML = p.originalPrice > p.price ? `<span class="badge-gr badge-sale">${discountLabel(p.originalPrice, p.price)}</span>` : '';
  document.querySelector('[data-pdp-short]').textContent = p.shortDescription || '';
  document.querySelector('[data-pdp-stock]').innerHTML = p.inStock
    ? '<span style="color:var(--gr-lime)">● In stock</span>'
    : '<span style="color:var(--gr-error)">● Currently unavailable</span>';

  // B2B MOQ / tier hint
  if (p.moq) {
    document.querySelector('[data-pdp-short]').insertAdjacentHTML('afterend',
      `<p class="caption" style="margin-top:.5rem">MOQ: <strong>${p.moq}</strong> units · Bulk pricing available — <a href="/modules/b2b/b2b-industrial.html">request a quote</a>.</p>`);
  }

  // Wishlist button: the shared initializer already ran on DOMContentLoaded and
  // bound this button while its data-* were still empty (and flagged it ready).
  // Replace the node with a fresh clone (drops the stale listener + ready flag),
  // set the real product data, then re-bind so Save targets THIS product.
  const wbOld = document.querySelector('[data-wishlist-toggle]');
  const wb = wbOld.cloneNode(true);
  Object.assign(wb.dataset, { id: p.id, title: p.title, brand: p.brand || '', price: p.price, image: p.image });
  delete wb.dataset.ready;
  wbOld.replaceWith(wb);
  initWishlistButtons(document);
}

function paintTabs(p) {
  document.querySelector('[data-pdp-description]').textContent = p.description || p.shortDescription || '';

  // Specifications — spec-sheet table for industrial, or a simple attribute list.
  const specsHost = document.querySelector('[data-pdp-specs]');
  if (p.specs && Object.keys(p.specs).length) {
    const rows = Object.entries(p.specs).map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`).join('');
    specsHost.innerHTML = `<table class="spec-table"><tbody>${rows}</tbody></table>` +
      (p.datasheet ? `<a class="btn-gr btn-outline-gr btn-sm-gr" href="${p.datasheet}" style="margin-top:1rem" download>Download datasheet (PDF)</a>` : '');
  } else {
    const attrs = { Brand: p.brand, Origin: p.origin, Category: p.categoryName };
    specsHost.innerHTML = `<table class="spec-table"><tbody>${Object.entries(attrs).filter(([, v]) => v).map(([k, v]) => `<tr><th scope="row">${k}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</tbody></table>`;
  }

  // Reviews (mock summary)
  document.querySelector('[data-pdp-reviews]').innerHTML = p.reviewCount
    ? `<p class="lead">${p.rating}★ average from ${p.reviewCount} verified buyers.</p>
       <div class="surface-gr" style="padding:1.25rem"><p style="color:var(--gr-lime)">${STAR.repeat(5)}</p><p style="margin:.5rem 0">“Exactly as described — authentic and well packed.”</p><p class="caption">Verified buyer</p></div>`
    : '<p class="text-muted-gr">No reviews yet. Be the first to review this product.</p>';

  // Tab switching
  const btns = document.querySelectorAll('.tab-btn');
  btns.forEach((btn) => btn.addEventListener('click', () => {
    btns.forEach((b) => { b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('is-active'); btn.setAttribute('aria-selected', 'true');
    document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = panel.dataset.panel !== btn.dataset.tab; });
  }));
}

function wireActions(p) {
  const stepper = document.querySelector('[data-qty-stepper]');
  setupStepper(stepper);
  stepper.addEventListener('qty:change', (e) => { currentQty = e.detail.value; });

  const addBtn = document.querySelector('[data-add-to-cart]');
  if (!p.inStock) { addBtn.disabled = true; addBtn.textContent = 'Sold out'; }
  addBtn.addEventListener('click', () => {
    if (!p.inStock) return;
    store.addToCart({ id: p.id, title: p.title, brand: p.brand, price: p.price, image: p.image }, currentQty);
    toast.success(`Added to cart · ${currentQty} × ${p.title}`);
    openCartDrawer();
  });
}

async function loadRelated(p) {
  const rail = document.querySelector('[data-related]');
  const related = await getRelated(p, 8);
  if (related.length) renderProductGrid(rail, related);
  else rail.closest('section').hidden = true;
}

function renderNotFound() {
  document.querySelector('[data-pdp]').innerHTML = `
    <div class="empty-state" style="grid-column:1/-1">
      <h1 class="empty-state__title">Product not found</h1>
      <p class="empty-state__text">This product may have sold out or the link is incorrect.</p>
      <a class="btn-gr btn-primary-gr" href="/index.html">Back to home</a>
    </div>`;
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
