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
import { track, productPayload } from '../../shared/js/core/analytics.js';
import { siteURL } from '../../shared/js/core/paths.js';
import { validateForm, attachLiveValidation } from '../../shared/js/utils/validate-form.js';
import { initBuyBar } from './pdp-buybar.js';

const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
let currentQty = 1;

/**
 * The size the customer has chosen, or a stand-in for products sold in one size
 * only. Everything downstream — the price block, the cart line, the wishlist
 * button, the WhatsApp message — reads from here rather than from the product,
 * so there is one answer to "which size is this page currently about".
 */
let currentVariant = null;

init();

async function init() {
  const id = getParam('id');
  const product = id ? await getProductById(id) : null;
  if (!product) return renderNotFound();

  document.title = `${product.title} — GulfRabit`;
  // After the not-found guard, so a bad ?id= does not report a product view.
  track('ViewContent', productPayload(product));
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

/**
 * The variant of a photograph to actually fetch.
 *
 * `full` is the WebP beside the JPEG — same pixels, ~22% fewer bytes.
 * `card` is 640px, which is four times the size a 96px thumbnail needs and
 * still a twentieth of the source. The build writes both; a source with no
 * variants (the placeholder SVGs) falls through unchanged, so this is safe
 * for any image the catalogue holds.
 */
function variant(src, kind) {
  const s = String(src || '');
  if (!s.toLowerCase().endsWith('.jpg')) return s;
  return s.slice(0, -4) + (kind === 'card' ? '-card.webp' : '.webp');
}

function paintGallery(p) {
  const main = document.querySelector('[data-gallery-main]');
  const thumbs = document.querySelector('[data-gallery-thumbs]');
  const images = p.images?.length ? p.images : [p.image];

  // <picture> so a browser without WebP still gets the JPEG. The main image
  // is the page's LCP element, so it is eager and high priority; every
  // thumbnail is a 96px button and takes the 640px file.
  main.innerHTML = `
    <picture>
      <source srcset="${escapeAttr(variant(images[0], 'full'))}" type="image/webp">
      <img src="${escapeAttr(images[0])}" alt="${escapeAttr(p.title)}" decoding="async"
           fetchpriority="high" data-main-img>
    </picture>`;

  thumbs.innerHTML = images.map((src, i) => `
    <button class="gallery__thumb ${i === 0 ? 'is-active' : ''}" data-thumb aria-label="View image ${i + 1}">
      <picture><source srcset="${escapeAttr(variant(src, 'card'))}" type="image/webp">
        <img src="${escapeAttr(src)}" alt="" loading="lazy" decoding="async"></picture>
    </button>`).join('');

  thumbs.querySelectorAll('[data-thumb]').forEach((btn, i) => btn.addEventListener('click', () => {
    // Swap BOTH, or the <source> keeps winning and the picture never changes
    // — the img.src alone is only the fallback branch.
    main.querySelector('source').srcset = variant(images[i], 'full');
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

  currentVariant = pickVariant(p, p.defaultVariant);
  paintVariants(p);
  paintPrice(p);

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
  Object.assign(wb.dataset, { id: p.id, title: p.title, brand: p.brand || '', price: currentVariant.price, image: p.image });
  delete wb.dataset.ready;
  wbOld.replaceWith(wb);
  initWishlistButtons(document);

  paintOrderChannels(p);
}

/* ---- Size ladder -------------------------------------------------------
   Products are one product at every size — same origin, same grade, same
   barcode series — so the size is a property of the price, not of the title.
   That is why the picker sits directly above Add to Cart and why the title
   above it never changes when you use it. */

function pickVariant(p, label) {
  const list = p.variants?.length ? p.variants : null;
  if (!list) {
    // Single-size products still get a variant object, so every caller below
    // can read .price and .label without asking which kind of product it is.
    return { label: null, price: p.price, originalPrice: p.originalPrice, inStock: p.inStock !== false };
  }
  return list.find((v) => v.label === label) ?? list[0];
}

function paintVariants(p) {
  const host = document.querySelector('[data-pdp-variants]');
  if (!host) return;

  // One size is not a choice. Showing a picker with a single button in it makes
  // the page look like it lost the other options.
  if (!p.variants?.length || p.variants.length < 2) { host.hidden = true; return; }

  host.hidden = false;
  const options = host.querySelector('[data-variant-options]');
  options.innerHTML = p.variants.map((v) => `
    <button class="variant-opt${v.label === currentVariant.label ? ' is-selected' : ''}" type="button"
            role="radio" aria-checked="${v.label === currentVariant.label}"
            data-variant="${escapeAttr(v.label)}" ${v.inStock === false ? 'disabled' : ''}>
      <span class="variant-opt__label">${escapeHtml(v.label)}</span>
      <span class="variant-opt__price">${formatBDT(v.price)}</span>
    </button>`).join('');

  options.querySelectorAll('[data-variant]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentVariant = pickVariant(p, btn.dataset.variant);
      options.querySelectorAll('[data-variant]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-checked', String(on));
      });
      paintPrice(p);
      // Everything that quotes a price has to move with the picker, or the page
      // contradicts itself: the buy bar on a phone, the Save button's stored
      // price, and the message that gets sent to WhatsApp.
      const wb = document.querySelector('[data-wishlist-toggle]');
      if (wb) wb.dataset.price = String(currentVariant.price);
      paintOrderChannels(p);
    });
  });
}

/** The unit rate, so 500 g at ৳1,380 and 1 kg at ৳2,650 can be compared. */
function unitRate(p, v) {
  if (!p.unit || !v.amount) return '';
  return `${formatBDT(Math.round(v.price / v.amount))} / ${p.unit}`;
}

function paintPrice(p) {
  const v = currentVariant;
  document.querySelector('[data-pdp-price]').textContent = formatBDT(v.price);
  document.querySelector('[data-pdp-original]').textContent = v.originalPrice > v.price ? formatBDT(v.originalPrice) : '';
  document.querySelector('[data-pdp-discount]').innerHTML = v.originalPrice > v.price
    ? `<span class="badge-gr badge-sale">${discountLabel(v.originalPrice, v.price)}</span>`
      + `<span class="price-saving">${savingsLabel(v.originalPrice, v.price)}</span>`
    : '';

  const unit = document.querySelector('[data-variant-unit]');
  if (unit) unit.textContent = unitRate(p, v);

  // The sticky buy bar reads the price out of the DOM rather than being told it
  // (see pdp-buybar.js). It only reads once, at mount, so it has to be told
  // when to read again.
  document.dispatchEvent(new CustomEvent('pdp:pricechange'));
}

/**
 * Carry the product into the chat so the agent never has to ask "which one?".
 * The number is read back out of the markup so the fragment stays the only
 * place it is written. Messenger has no prefilled-text parameter — m.me only
 * forwards `ref` to the page's webhook — so it gets the id and nothing more.
 */
function paintOrderChannels(p) {
  const link = siteURL(`modules/catalog/product.html?id=${encodeURIComponent(p.id)}`);
  const v = currentVariant ?? { label: null, price: p.price };
  const message = [
    'Hello GulfRabit, I would like to order:',
    `Product: ${p.title}`,
    // The size goes in the message, or an order placed from this button starts
    // with the agent asking which pack — which is the one question this button
    // exists to prevent.
    ...(v.label ? [`Size: ${v.label}`] : []),
    `Price: ${formatBDT(v.price)}`,
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
    // The chosen size, at the chosen size's price — not the product's default.
    const line = { ...p, price: currentVariant.price, variant: currentVariant.label };
    store.addToCart(line, currentQty);
    toast.success(`Added to cart · ${currentQty} × ${p.title}${currentVariant.label ? ` (${currentVariant.label})` : ''}`);
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
