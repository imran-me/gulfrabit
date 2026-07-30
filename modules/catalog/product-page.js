/**
 * product-page.js — glue for product.html (PDP).
 * Reads ?id=, loads the product, fills the gallery/info/tabs, wires add-to-cart
 * and quantity, and renders related products. Industrial/B2B products get a
 * spec-sheet table and read as B2B rather than lifestyle.
 */

import { getProductById, getRelated, getAllProducts } from './backend/api.js';
import { storage } from '../../shared/js/core/storage.js';
import { formatBDT, discountLabel, savingsLabel } from '../../shared/js/utils/format-currency.js';
import * as store from '../../shared/js/core/state.js';
import { toast } from '../../shared/js/components/toast-notifications.js';
import { openCartDrawer } from '../../shared/js/components/cart-drawer.js';
import { renderProductGrid, productBadges } from '../../shared/js/components/product-card.js';
import { setup as setupStepper } from '../../shared/js/components/quantity-stepper.js';
import { initWishlistButtons } from '../../shared/js/components/wishlist.js';
import { getParam } from '../../shared/js/core/router-helpers.js';
import { siteURL } from '../../shared/js/core/paths.js';
import { validateForm, attachLiveValidation } from '../../shared/js/utils/validate-form.js';
import { initBuyBar } from './pdp-buybar.js';

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
  recordRecent(product.id);
  loadRecentlyViewed(product);

  // After paintInfo and wireActions: the bar reads the rendered price and
  // forwards clicks to the real Add to Cart button, so both have to exist by
  // the time it mounts.
  initBuyBar();
}

/* ---- Recently viewed (localStorage history) --------------------------- */
function recordRecent(id) {
  const list = storage.get('recent-viewed', []).filter((x) => x !== id);
  list.unshift(id);
  storage.set('recent-viewed', list.slice(0, 12));
}

async function loadRecentlyViewed(current) {
  const ids = storage.get('recent-viewed', []).filter((id) => id !== current.id);
  if (!ids.length) return;
  const all = await getAllProducts();
  const items = ids.map((id) => all.find((p) => p.id === id)).filter(Boolean).slice(0, 8);
  if (!items.length) return;
  document.querySelector('[data-recent-section]').hidden = false;
  renderProductGrid(document.querySelector('[data-recent-rail]'), items);
}

/**
 * Inject Product structured data (schema.org) for rich results. Enhancement
 * only — the human-readable detail is already in the DOM.
 */
function injectProductSchema(p) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    image: [siteURL((p.images?.[0] || p.image))],
    description: p.shortDescription || p.description || '',
    sku: p.id,
    brand: { '@type': 'Brand', name: p.brand || 'GulfRabit' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BDT',
      price: p.price,
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: siteURL(`modules/catalog/product.html?id=${p.id}`),
    },
  };
  if (p.rating && p.reviewCount) {
    schema.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviewCount };
  }
  appendLd(schema);

  // Breadcrumb trail: Home › Category › Product.
  appendLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteURL('index.html') },
      { '@type': 'ListItem', position: 2, name: p.categoryName, item: siteURL(`modules/catalog/category.html?slug=${p.categorySlug}`) },
      { '@type': 'ListItem', position: 3, name: p.title },
    ],
  });
}

function appendLd(obj) {
  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.textContent = JSON.stringify(obj);
  document.head.appendChild(el);
}

function paintGallery(p) {
  const main = document.querySelector('[data-gallery-main]');
  const thumbs = document.querySelector('[data-gallery-thumbs]');
  const images = p.images?.length ? p.images : [p.image];
  main.innerHTML = `<img src="${images[0]}" alt="${escapeAttr(p.title)}" decoding="async" data-main-img>`;
  thumbs.innerHTML = images.map((src, i) => `
    <button class="gallery__thumb ${i === 0 ? 'is-active' : ''}" data-thumb aria-label="View image ${i + 1}"><img src="${src}" alt=""></button>`).join('');
  thumbs.querySelectorAll('[data-thumb]').forEach((btn, i) => btn.addEventListener('click', () => {
    main.querySelector('[data-main-img]').src = images[i];
    thumbs.querySelectorAll('[data-thumb]').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
  }));
}

function paintInfo(p) {
  // Same priority as the card, one extra slot — the buy column has the room.
  document.querySelector('[data-pdp-badges]').innerHTML = productBadges(p, 3).join('');

  document.querySelector('[data-pdp-brand]').textContent = [p.brand, p.origin].filter(Boolean).join(' · ');
  document.querySelector('[data-pdp-title]').textContent = p.title;
  document.querySelector('[data-crumb-title]').textContent = p.title;
  const crumbCat = document.querySelector('[data-crumb-cat]');
  crumbCat.textContent = p.categoryName; crumbCat.href = siteURL(`modules/catalog/category.html?slug=${p.categorySlug}`);

  const full = Math.round(p.rating || 0);
  document.querySelector('[data-pdp-rating]').innerHTML =
    `<span style="display:inline-flex;color:var(--lime-ink)">${STAR.repeat(full)}</span><span style="display:inline-flex;color:var(--border-input)">${STAR.repeat(5 - full)}</span><span class="caption">${p.rating || 0} · ${p.reviewCount || 0} reviews</span>`;

  document.querySelector('[data-pdp-price]').textContent = formatBDT(p.price);
  document.querySelector('[data-pdp-original]').textContent = p.originalPrice > p.price ? formatBDT(p.originalPrice) : '';
  document.querySelector('[data-pdp-discount]').innerHTML = p.originalPrice > p.price
    ? `<span class="badge-gr badge-sale">${discountLabel(p.originalPrice, p.price)}</span>`
      + `<span class="price-saving">${savingsLabel(p.originalPrice, p.price)}</span>`
    : '';
  document.querySelector('[data-pdp-short]').textContent = p.shortDescription || '';
  document.querySelector('[data-pdp-stock]').innerHTML = p.inStock
    ? '<span style="color:var(--lime-ink)">● In stock</span>'
    : '<span style="color:var(--gr-error)">● Currently unavailable</span>';

  // B2B MOQ / tier hint
  if (p.moq) {
    document.querySelector('[data-pdp-short]').insertAdjacentHTML('afterend',
      // Grouped: the offers block below says "1,000-unit minimum order" and an
      // ungrouped "1000" two lines above it reads like a different number.
      `<p class="caption" style="margin-top:.5rem">MOQ: <strong>${p.moq.toLocaleString('en-BD')}</strong> units · Bulk pricing available — <a href="${siteURL('modules/b2b/b2b-industrial.html')}">request a quote</a>.</p>`);
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

  paintOrderChannels(p);
}

/**
 * Carry the product into the chat so the agent never has to ask "which one?".
 * The number is read back out of the markup so the fragment stays the only
 * place it is written. Messenger has no prefilled-text parameter — m.me only
 * forwards `ref` to the page's webhook — so it gets the id and nothing more.
 */
function paintOrderChannels(p) {
  const link = siteURL(`modules/catalog/product.html?id=${encodeURIComponent(p.id)}`);
  const message = [
    'Hello GulfRabit, I would like to order:',
    `Product: ${p.title}`,
    `Price: ${formatBDT(p.price)}`,
    `SKU: ${p.id}`,
    `Link: ${link}`,
  ].join('\n');

  const wa = document.querySelector('[data-order-whatsapp]');
  if (wa) {
    const phone = (wa.getAttribute('href').match(/wa\.me\/(\d+)/) || [])[1];
    if (phone) wa.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    wa.setAttribute('aria-label', `Order ${p.title} on WhatsApp`);
  }

  const fb = document.querySelector('[data-order-messenger]');
  if (fb) {
    fb.href = `${fb.getAttribute('href').split('?')[0]}?ref=${encodeURIComponent(`product-${p.id}`)}`;
    fb.setAttribute('aria-label', `Message us about ${p.title}`);
  }
}

function paintTabs(p) {
  document.querySelector('[data-pdp-description]').textContent = p.description || p.shortDescription || '';

  // Specifications. Provenance leads and renders for EVERY product — "Sourced.
  // Verified. Delivered." is the promise, so the checkable facts (origin,
  // barcode) are the product, not a footnote. The previous split sent industrial
  // SKUs down a specs-only branch that dropped origin entirely.
  const specsHost = document.querySelector('[data-pdp-specs]');
  const details = {
    Brand: p.brand,
    'Country of origin': p.origin,
    Barcode: p.barcode,
    Category: p.categoryName,
  };
  if (p.moq) details['Minimum order'] = `${p.moq} units`;

  const detailRows = Object.entries(details)
    .filter(([, v]) => v)
    .map(([k, v]) => {
      const cell = k === 'Barcode'
        ? `<td><span class="barcode-value">${escapeHtml(String(v))}</span></td>`
        : `<td>${escapeHtml(String(v))}</td>`;
      return `<tr><th scope="row">${k}</th>${cell}</tr>`;
    })
    .join('');

  let html = `<h3 class="spec-heading">Product details</h3>
    <table class="spec-table"><tbody>${detailRows}</tbody></table>`;

  if (p.specs && Object.keys(p.specs).length) {
    const rows = Object.entries(p.specs)
      .map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`)
      .join('');
    html += `<h3 class="spec-heading">Technical specification</h3>
      <table class="spec-table"><tbody>${rows}</tbody></table>`;
    if (p.datasheet) {
      html += `<a class="btn-gr btn-outline-gr btn-sm-gr" href="${p.datasheet}" style="margin-top:1rem" download>Download datasheet (PDF)</a>`;
    }
  }
  specsHost.innerHTML = html;

  renderFaq(p);
  renderReviews(p);

  // Tab switching
  const btns = document.querySelectorAll('.tab-btn');
  btns.forEach((btn) => btn.addEventListener('click', () => {
    btns.forEach((b) => { b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('is-active'); btn.setAttribute('aria-selected', 'true');
    document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = panel.dataset.panel !== btn.dataset.tab; });
  }));
}

/* ---- FAQ --------------------------------------------------------------
   Answers come from the product's own data (see tools/gen-product-faq.py), so
   they name the real barcode, origin and MOQ. Rendered as <details> — native
   disclosure is keyboard-accessible and searchable by the browser's find,
   which a JS accordion has to reimplement badly. */
function renderFaq(p) {
  const host = document.querySelector('[data-pdp-faq]');
  if (!host) return;

  const faq = p.faq || [];
  const tabBtn = document.querySelector('.tab-btn[data-tab="faq"]');

  // No questions for this product: hide the tab rather than showing an empty
  // panel, which reads as broken.
  if (!faq.length) {
    if (tabBtn) tabBtn.hidden = true;
    return;
  }

  host.innerHTML = faq.map((item, i) => `
    <details class="faq-item"${i === 0 ? ' open' : ''}>
      <summary class="faq-item__q">${escapeHtml(item.q)}</summary>
      <div class="faq-item__a">${escapeHtml(item.a)}</div>
    </details>`).join('');

  injectFaqSchema(faq);
}

/**
 * FAQPage structured data — this is the one schema type that still earns
 * expanded results, and the questions are exactly what people type into search.
 * Enhancement only; the answers are already in the DOM.
 */
function injectFaqSchema(faq) {
  appendLd({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  });
}

/* ---- Reviews (localStorage-backed, with a write-review form) ---------- */
function reviewsKey(id) { return `reviews:${id}`; }

function getReviews(p) {
  const stored = storage.get(reviewsKey(p.id), null);
  if (stored) return stored;
  // Seed one on-brand review so the section isn't empty on first visit.
  return p.reviewCount ? [{ name: 'Verified buyer', rating: Math.round(p.rating || 5), text: 'Exactly as described — authentic and well packed.', date: '2026-07-10' }] : [];
}

function renderReviews(p) {
  const host = document.querySelector('[data-pdp-reviews]');
  const reviews = getReviews(p);
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : (p.rating || 0);

  const summary = reviews.length
    ? `<div class="review-summary"><span class="review-summary__avg">${avg.toFixed(1)}</span>
         <span><span class="review-card__stars">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</span>
         <div class="caption">${reviews.length} review${reviews.length === 1 ? '' : 's'}</div></span></div>`
    : '<p class="text-muted-gr">No reviews yet. Be the first to review this product.</p>';

  const list = reviews.map((r) => `
    <div class="review-card">
      <div class="review-card__head"><strong>${escapeHtml(r.name)}</strong><span class="caption">${escapeHtml(r.date || '')}</span></div>
      <div class="review-card__stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
      <p style="margin-top:.5rem">${escapeHtml(r.text)}</p>
    </div>`).join('');

  host.innerHTML = `
    ${summary}
    <div class="stack-4" style="margin-top:1.5rem">${list}</div>
    <form class="review-form stack-4" data-review-form novalidate style="margin-top:1.5rem">
      <h3 class="h5">Write a review</h3>
      <div class="star-input" data-star-input role="radiogroup" aria-label="Your rating">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n} star${n > 1 ? 's' : ''}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z"/></svg></button>`).join('')}
      </div>
      <div class="field-gr" data-field><label class="label-gr" for="rv-name">Name</label><input id="rv-name" class="input-gr" name="name" data-validate="required|min:2" data-label="Name"><span class="field-error" data-error></span></div>
      <div class="field-gr" data-field><label class="label-gr" for="rv-text">Review</label><textarea id="rv-text" class="textarea-gr" name="text" data-validate="required|min:8" data-label="Review"></textarea><span class="field-error" data-error></span></div>
      <button class="btn-gr btn-primary-gr" type="submit">Submit review</button>
    </form>`;

  wireReviewForm(p, host);
}

function wireReviewForm(p, host) {
  const form = host.querySelector('[data-review-form]');
  attachLiveValidation(form);
  let rating = 0;
  const stars = [...form.querySelectorAll('[data-star]')];
  const paint = (val, cls) => stars.forEach((b, i) => b.classList.toggle(cls, i < val));
  stars.forEach((btn, i) => {
    btn.addEventListener('mouseenter', () => paint(i + 1, 'is-hover'));
    btn.addEventListener('mouseleave', () => paint(0, 'is-hover'));
    btn.addEventListener('click', () => { rating = i + 1; paint(rating, 'is-on'); });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { valid, values } = validateForm(form);
    if (!rating) { toast.error('Please choose a star rating.'); return; }
    if (!valid) return;
    const reviews = getReviews(p);
    reviews.unshift({ name: values.name, rating, text: values.text, date: new Date().toISOString().slice(0, 10) });
    storage.set(reviewsKey(p.id), reviews);
    toast.success('Thanks — your review was added.');
    renderReviews(p);
  });
}

function wireActions(p) {
  const stepper = document.querySelector('[data-qty-stepper]');

  // The MOQ was being *printed* under the price while the stepper still started
  // at 1 and stepped by 1 — so a part with a 1,000-unit minimum could be added
  // to the cart as a single unit, at a unit price that only exists at 1,000.
  // The minimum is a fact about the product, so it belongs in the control, not
  // only in the caption next to it.
  if (p.moq) {
    stepper.dataset.min = String(p.moq);
    stepper.dataset.step = String(p.moq);
    stepper.dataset.max = String(p.moq * 1000);
    stepper.querySelector('[data-qty-input]').value = String(p.moq);
    // main.js already enhanced this stepper on DOMContentLoaded, before the
    // product was known, and setup() is guarded against running twice. Clear
    // the flag so the re-run below actually takes the new bounds.
    delete stepper.dataset.ready;
  }
  setupStepper(stepper);
  stepper.addEventListener('qty:change', (e) => { currentQty = e.detail.value; });

  const addBtn = document.querySelector('[data-add-to-cart]');
  if (!p.inStock) { addBtn.disabled = true; addBtn.textContent = 'Sold out'; }
  addBtn.addEventListener('click', () => {
    if (!p.inStock) return;
    store.addToCart(p, currentQty);
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
      <a class="btn-gr btn-primary-gr" href="${siteURL('index.html')}">Back to home</a>
    </div>`;
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
