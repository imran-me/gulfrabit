/**
 * product-card — the reusable product card.
 *
 * Two roles, one source of truth:
 *  1. productCardHTML(product) returns the canonical card markup — used by
 *     data-driven grids (category, search, related rails) to render lists.
 *  2. enhanceProductCards(root) wires behaviour (wishlist toggle, add-to-cart,
 *     quick-view) onto ANY card in the DOM via data-attributes — so cards that
 *     are hand-authored in HTML behave identically to JS-rendered ones.
 *
 * Cards carry their product payload in data-* attributes, so behaviour never
 * needs to re-fetch. This keeps the site content-first: the card is real HTML;
 * JS only adds interaction.
 */

import { formatBDT, discountLabel } from '../utils/format-currency.js';
import * as store from '../core/state.js';
import { siteURL } from '../core/paths.js';
import { toast } from './toast-notifications.js';
import { openCartDrawer } from './cart-drawer.js';

const HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const EYE   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const SCALE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20"><path d="M12 3v18M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/></svg>';
const STAR  = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';

/** Star rating markup (filled vs muted). */
function starsHTML(rating = 0, count = 0) {
  const full = Math.round(rating);
  let s = '<span class="product-card__stars" aria-label="Rated ' + rating + ' out of 5">';
  for (let i = 1; i <= 5; i++) {
    s += `<span style="color:${i <= full ? 'var(--gr-lime)' : 'var(--gr-border)'}">${STAR}</span>`;
  }
  s += `</span><span class="caption">(${count})</span>`;
  return s;
}

/** Product detail URL (query-param driven). */
export function productURL(product) {
  return siteURL(`modules/catalog/product.html?id=${encodeURIComponent(product.id)}`);
}

/** Canonical card markup for a product object. */
export function productCardHTML(product) {
  const {
    id, title, brand, origin, price, originalPrice, image, rating = 0,
    reviewCount = 0, inStock = true, tags = [],
  } = product;

  const badges = [];
  if (tags.includes('premium')) badges.push('<span class="badge-gr badge-premium">Premium</span>');
  if (originalPrice && originalPrice > price) badges.push(`<span class="badge-gr badge-sale">${discountLabel(originalPrice, price)}</span>`);
  else if (tags.includes('new')) badges.push('<span class="badge-gr badge-new">New</span>');
  if (!inStock) badges.push('<span class="badge-gr badge-out">Sold out</span>');

  const wished = store.isWishlisted(id);

  return `
  <article class="product-card" data-product-card
           data-id="${id}" data-title="${escapeAttr(title)}" data-brand="${escapeAttr(brand || '')}"
           data-price="${price}" data-image="${escapeAttr(image)}">
    <div class="product-card__media">
      <div class="product-card__badges">${badges.join('')}</div>
      <div class="product-card__actions">
        <button class="btn-icon-gr" data-action="wishlist" aria-pressed="${wished}"
                aria-label="${wished ? 'Remove from wishlist' : 'Add to wishlist'}"
                style="background:var(--gr-graphite);${wished ? 'color:var(--gr-lime)' : ''}">${HEART}</button>
        <button class="btn-icon-gr" data-action="quickview" aria-label="Quick view"
                style="background:var(--gr-graphite)">${EYE}</button>
        <button class="btn-icon-gr" data-action="compare" aria-pressed="${store.isInCompare(id)}"
                aria-label="Add to compare" style="background:var(--gr-graphite);${store.isInCompare(id) ? 'color:var(--gr-cyan)' : ''}">${SCALE}</button>
      </div>
      <a href="${productURL(product)}" aria-label="${escapeAttr(title)}">
        <img class="product-card__img" src="${escapeAttr(image)}" alt="${escapeAttr(title)}" loading="lazy" decoding="async" width="400" height="500">
      </a>
    </div>
    <div class="product-card__body">
      ${brand ? `<span class="product-card__brand">${escapeHtml(brand)}${origin ? ` · ${escapeHtml(origin)}` : ''}</span>` : ''}
      <a href="${productURL(product)}"><h3 class="product-card__title">${escapeHtml(title)}</h3></a>
      <div style="display:flex;align-items:center;gap:6px">${starsHTML(rating, reviewCount)}</div>
      <div class="product-card__price-row">
        <span class="price product-card__price">${formatBDT(price)}</span>
        ${originalPrice && originalPrice > price ? `<span class="price price--strike">${formatBDT(originalPrice)}</span>` : ''}
      </div>
      <button class="btn-gr btn-primary-gr btn-block-gr btn-sm-gr" data-action="add-to-cart"
              ${inStock ? '' : 'disabled'} style="margin-top:.5rem">
        ${inStock ? 'Add to Cart' : 'Notify Me'}
      </button>
    </div>
  </article>`;
}

/** Render a list of products into a container. */
export function renderProductGrid(container, products) {
  if (!container) return;
  container.innerHTML = products.map(productCardHTML).join('');
  enhanceProductCards(container);
}

/** Read the product payload back off a card element. */
function cardPayload(card) {
  return {
    id: card.dataset.id,
    title: card.dataset.title,
    brand: card.dataset.brand,
    price: Number(card.dataset.price),
    image: card.dataset.image,
  };
}

/**
 * Wire behaviour onto every [data-product-card] under `root`.
 * Idempotent — guards with a data flag so re-enhancing is safe.
 */
export function enhanceProductCards(root = document) {
  root.querySelectorAll('[data-product-card]').forEach((card) => {
    if (card.dataset.enhanced) return;
    card.dataset.enhanced = 'true';
    const product = cardPayload(card);

    card.querySelector('[data-action="add-to-cart"]')?.addEventListener('click', (e) => {
      if (e.currentTarget.disabled) return;
      store.addToCart(product, 1);
      toast.success(`Added to cart · ${product.title}`);
      openCartDrawer();
    });

    const wishBtn = card.querySelector('[data-action="wishlist"]');
    wishBtn?.addEventListener('click', () => {
      const active = store.toggleWishlist(product);
      wishBtn.setAttribute('aria-pressed', String(active));
      wishBtn.style.color = active ? 'var(--gr-lime)' : '';
      wishBtn.setAttribute('aria-label', active ? 'Remove from wishlist' : 'Add to wishlist');
      toast.info(active ? 'Saved to wishlist' : 'Removed from wishlist');
    });

    const cmpBtn = card.querySelector('[data-action="compare"]');
    cmpBtn?.addEventListener('click', () => {
      const { active, full } = store.toggleCompare(product.id);
      if (full) { toast.error(`Compare holds up to ${store.COMPARE_MAX} — remove one first`); return; }
      cmpBtn.setAttribute('aria-pressed', String(active));
      cmpBtn.style.color = active ? 'var(--gr-cyan)' : '';
      toast.info(active ? 'Added to compare' : 'Removed from compare');
    });

    card.querySelector('[data-action="quickview"]')?.addEventListener('click', () => {
      // Quick-view modal is optional enhancement; fall back to the PDP link.
      import('./quick-view-modal.js')
        .then((m) => m.openQuickView(product.id))
        .catch(() => { window.location.href = siteURL(`modules/catalog/product.html?id=${product.id}`); });
    });
  });
}

/* ---- tiny escapers ---------------------------------------------------- */
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
