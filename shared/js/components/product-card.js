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

import { formatBDT, discountLabel, savingsLabel } from '../utils/format-currency.js';
import * as store from '../core/state.js';
import { siteURL } from '../core/paths.js';
import { toast } from './toast-notifications.js';

const HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const EYE   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const SCALE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20"><path d="M12 3v18M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/></svg>';
const STAR  = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';

/** Star rating markup (filled vs muted). */
function starsHTML(rating = 0, count = 0) {
  const full = Math.round(rating);
  let s = '<span class="product-card__stars" aria-label="Rated ' + rating + ' out of 5">';
  for (let i = 1; i <= 5; i++) {
    s += `<span style="color:${i <= full ? 'var(--lime-ink)' : 'var(--border-input)'}">${STAR}</span>`;
  }
  s += `</span><span class="caption">(${count})</span>`;
  return s;
}

/** Product detail URL (query-param driven). */
export function productURL(product) {
  return siteURL(`modules/catalog/product.html?id=${encodeURIComponent(product.id)}`);
}

/** Canonical card markup for a product object. */
/**
 * Badges in fixed priority order, capped so the stack can never sprawl.
 *
 * Daraz solves badge sprawl by having the server return pre-composed badge
 * images in numbered slots, which caps the row deterministically. We don't need
 * the sprite machinery, but we do need the discipline: a stable priority and a
 * hard limit, so two cards side by side always have the same badge geometry.
 *
 * Priority is by how much the badge changes a buying decision. Sold-out
 * outranks everything (nothing else matters if you can't buy it) and returns
 * alone; a discount beats a quality label; "new" is the weakest signal and only
 * appears when nothing louder is competing for the slot.
 *
 * @param {object} product
 * @param {number} [max] slots available — 2 on a card, 3 on the roomier PDP
 * @returns {string[]} badge HTML, already truncated to `max`
 */
export function productBadges(product, max = 2) {
  const { price, originalPrice, inStock = true, tags = [] } = product;

  if (!inStock) return ['<span class="badge-gr badge-out">Sold out</span>'];

  const candidates = [
    originalPrice && originalPrice > price
      ? `<span class="badge-gr badge-sale">${discountLabel(originalPrice, price)}</span>` : '',
    tags.includes('premium') ? '<span class="badge-gr badge-premium">Premium</span>' : '',
    tags.includes('b2b') ? '<span class="badge-gr badge-origin">B2B</span>' : '',
    tags.includes('new') ? '<span class="badge-gr badge-new">New</span>' : '',
  ];

  return candidates.filter(Boolean).slice(0, max);
}

/**
 * WebP sources for a card image, when the build has produced them.
 *
 * A card is 160px wide on a phone and ~280px on a desktop grid; the source
 * photographs are 1254px square. Serving those to a grid of eight meant
 * decoding twenty times the pixels the card can show — the single biggest
 * cost on every listing page. `-card.webp` is 640px, which still covers a
 * 320px card on a 2x screen.
 *
 * The JPEG stays as the <img> src, so a browser without WebP (and any build
 * where these files were not generated) renders exactly what it did before.
 * Only .jpg sources get the treatment — the placeholder SVGs are already
 * tiny and have no raster variants.
 */
function cardSources(image) {
  const src = String(image || '');
  if (!src.toLowerCase().endsWith('.jpg')) return '';
  const base = escapeAttr(src.slice(0, -4));
  return `
          <source srcset="${base}-card.webp" type="image/webp">`;
}

/**
 * The pack sizes, as choosable chips.
 *
 * EVERY product in this catalogue is sold in two or three sizes, and the card
 * used to display the default one and add THAT to the cart on a tap. The size
 * was printed, so it was not a lie — but a customer scanning a grid reads the
 * price, taps, and finds out at the door that 500g is not the 1kg they meant.
 * On cash-on-delivery that is a refused parcel, not a return.
 *
 * So the choice moves onto the card. The chips carry their own price in
 * data-* rather than the card carrying a JSON blob of every variant: the
 * handler needs three numbers per chip, and inlining a serialised array into
 * every card in a twenty-card grid is a lot of bytes for data the DOM can
 * hold as attributes.
 *
 * Nothing is rendered for a product with one size or none — there is no
 * choice to offer, and an empty row of one chip is just noise.
 */
function sizeChips(product) {
  const variants = Array.isArray(product.variants) ? product.variants.filter((v) => v?.label) : [];
  if (variants.length < 2) return '';

  const current = product.defaultVariant ?? variants[0].label;
  const chips = variants.map((v) => {
    const on = v.label === current;
    const out = v.inStock === false;
    return `<button type="button" class="size-chip${on ? ' is-on' : ''}" data-size-chip
            ${out ? 'disabled' : ''} aria-pressed="${on}"
            data-v-label="${escapeAttr(v.label)}" data-v-price="${v.price}"
            data-v-original="${v.originalPrice ?? ''}"
            >${escapeHtml(v.label)}</button>`;
  }).join('');

  // A group, so a screen reader announces these as one control rather than as
  // three unrelated buttons between a price and an Add to Cart.
  return `<div class="size-chips" role="group" aria-label="Pack size">${chips}</div>`;
}

export function productCardHTML(product) {
  const {
    id, title, brand, origin, price, originalPrice, image, rating = 0,
    reviewCount = 0, inStock = true, tags = [], defaultVariant = null,
  } = product;

  const badges = productBadges(product);
  const wished = store.isWishlisted(id);
  const hasChoice = Array.isArray(product.variants)
    && product.variants.filter((v) => v?.label).length > 1;

  return `
  <article class="product-card" data-product-card
           data-id="${id}" data-title="${escapeAttr(title)}" data-brand="${escapeAttr(brand || '')}"
           data-price="${price}" data-image="${escapeAttr(image)}"
           data-variant="${escapeAttr(defaultVariant || '')}">
    <div class="product-card__media">
      <div class="product-card__badges">${badges.join('')}</div>
      <div class="product-card__actions">
        <button class="btn-icon-gr" data-action="wishlist" aria-pressed="${wished}"
                aria-label="${wished ? 'Remove from wishlist' : 'Add to wishlist'}"
                style="background:var(--surface-sunken);${wished ? 'color:var(--lime-ink)' : ''}">${HEART}</button>
        <button class="btn-icon-gr" data-action="quickview" aria-label="Quick view"
                style="background:var(--surface-sunken)">${EYE}</button>
      </div>
      <a href="${productURL(product)}" aria-label="${escapeAttr(title)}">
        <picture>${cardSources(image)}
          <img class="product-card__img" src="${escapeAttr(image)}" alt="${escapeAttr(title)}" loading="lazy" decoding="async" width="400" height="500">
        </picture>
      </a>
    </div>
    <div class="product-card__body">
      ${brand ? `<span class="product-card__brand">${escapeHtml(brand)}${origin ? ` · ${escapeHtml(origin)}` : ''}</span>` : ''}
      <a href="${productURL(product)}"><h3 class="product-card__title">${escapeHtml(title)}</h3></a>
      <div style="display:flex;align-items:center;gap:6px">${starsHTML(rating, reviewCount)}</div>
      <div class="product-card__price-row">
        <span class="price product-card__price">${formatBDT(price)}</span>
        ${originalPrice && originalPrice > price ? `<span class="price price--strike">${formatBDT(originalPrice)}</span>` : ''}
        ${/* Which size that price buys. Without it a card reading ৳ 875 beside
              one reading ৳ 1,380 looks like a price difference when it is a
              pack-size difference.
              Only when there is nothing to choose — otherwise the chips below
              say the size, and saying it twice on a 163px card is clutter. */
          defaultVariant && !hasChoice ? `<span class="product-card__size">${escapeHtml(defaultVariant)}</span>` : ''}
      </div>
      ${originalPrice && originalPrice > price ? `<span class="price-saving">${savingsLabel(originalPrice, price)}</span>` : ''}
      ${sizeChips(product)}
      <button class="btn-gr btn-primary-gr btn-block-gr btn-sm-gr" data-action="add-to-cart"
              ${inStock ? '' : 'disabled'}>
        ${inStock ? '<span class="btn-gr__en">Add to Cart</span><span class="btn-bn bn" lang="bn">কার্টে যোগ করুন</span>' : 'Notify Me'}
      </button>
    </div>
  </article>`;
}

/** Render a list of products into a container. */
export function renderProductGrid(container, products) {
  if (!container) return;
  container.innerHTML = products.map(productCardHTML).join('');
  enhanceProductCards(container);
  // Fresh markup starts with whatever `wished` was true at render time; this
  // makes it true at PAINT time, which is not the same thing after a toggle
  // in another tab or on another card for the same product.
  syncWishlistHearts(container);
}

/** Read the product payload back off a card element. */
function cardPayload(card) {
  return {
    id: card.dataset.id,
    title: card.dataset.title,
    brand: card.dataset.brand,
    price: Number(card.dataset.price),
    image: card.dataset.image,
    // The size the card is priced at. Cart lines are keyed on id + variant, so
    // this is what stops a card add and a PDP add of the same size becoming two
    // lines — and what stops a card add of the default size merging into a line
    // the customer built at 1 kg on the product page.
    variant: card.dataset.variant || null,
  };
}

/**
 * Wire behaviour onto every [data-product-card] under `root`.
 * Idempotent — guards with a data flag so re-enhancing is safe.
 */
/**
 * Repaint every wishlist heart on the page from the store.
 *
 * WHY THE BUTTON DOES NOT PAINT ITSELF ANY MORE
 * ---------------------------------------------
 * A product can legitimately appear on the page more than once — the home
 * rails repeat their set so a shelf has enough runway to march, and a product
 * can sit in a rail and in Recently Viewed at the same time. When the click
 * handler painted only the button that was clicked, the other copies kept the
 * old heart, so one card said saved and its twin said not.
 *
 * Driving every heart off the one place that actually knows — the store —
 * makes duplicates correct by construction, and fixes the same staleness for
 * a wishlist changed in another tab (state.js mirrors the `storage` event) or
 * from the wishlist page itself.
 */
function syncWishlistHearts(root = document) {
  const saved = new Set(store.getWishlist().map((w) => w.id));
  root.querySelectorAll('[data-product-card]').forEach((card) => {
    const btn = card.querySelector('[data-action="wishlist"]');
    if (!btn) return;
    const active = saved.has(card.dataset.id);
    btn.setAttribute('aria-pressed', String(active));
    btn.style.color = active ? 'var(--lime-ink)' : '';
    btn.setAttribute('aria-label', active ? 'Remove from wishlist' : 'Add to wishlist');
  });
}

/* One subscription for the whole page, not one per card: cards are rendered
   and re-rendered constantly, and a listener per card would accumulate
   thousands of them over a browsing session with nothing ever unsubscribing. */
store.subscribe(store.EVENTS.WISHLIST, () => syncWishlistHearts());

export function enhanceProductCards(root = document) {
  root.querySelectorAll('[data-product-card]').forEach((card) => {
    if (card.dataset.enhanced) return;
    card.dataset.enhanced = 'true';

    /* Pack size, chosen on the card.
     *
     * The chips rewrite the card's data-* rather than holding state in a
     * closure, because cardPayload() reads those attributes at click time —
     * so Add to Cart picks up the chosen size without knowing chips exist,
     * and a card whose chips were never touched behaves exactly as before.
     * Cart lines are keyed on id + variant, so this also keeps a 200g add and
     * a 1kg add as two lines rather than silently merging. */
    const chips = [...card.querySelectorAll('[data-size-chip]')];
    if (chips.length) {
      const priceEl = card.querySelector('.product-card__price');
      const strikeEl = card.querySelector('.price--strike');
      const savingEl = card.querySelector('.price-saving');

      chips.forEach((chip) => chip.addEventListener('click', () => {
        const price = Number(chip.dataset.vPrice);
        const original = Number(chip.dataset.vOriginal) || 0;
        if (!Number.isFinite(price)) return;

        card.dataset.price = String(price);
        card.dataset.variant = chip.dataset.vLabel;

        chips.forEach((c) => {
          const on = c === chip;
          c.classList.toggle('is-on', on);
          c.setAttribute('aria-pressed', String(on));
        });

        if (priceEl) priceEl.textContent = formatBDT(price);
        // Both the strike and the saving are conditional on THIS size actually
        // being discounted — a rung that is not on offer must not inherit the
        // previous rung's saving, which would be an invented discount.
        const cut = original > price;
        if (strikeEl) {
          strikeEl.textContent = cut ? formatBDT(original) : '';
          strikeEl.hidden = !cut;
        }
        if (savingEl) {
          savingEl.textContent = cut ? savingsLabel(original, price) : '';
          savingEl.hidden = !cut;
        }
      }));
    }

    /* Read at CLICK time, not once at enhance time.
     *
     * The size chips above rewrite the card's data-price and data-variant, so
     * a payload snapshotted here would still be the default size — the chips
     * would repaint the price and then add the wrong pack to the cart, which
     * is worse than not offering the choice at all. */
    const product = () => cardPayload(card);

    card.querySelector('[data-action="add-to-cart"]')?.addEventListener('click', (e) => {
      if (e.currentTarget.disabled) return;
      const chosen = product();
      store.addToCart(chosen, 1);
      /* A toast OR the drawer, never both.
       *
       * Both fired before, and on a phone the drawer is a full-screen
       * takeover — so the toast announced something the customer was already
       * staring at, and the grid they were half-way down was gone. Adding a
       * second item then meant closing the drawer, finding your place, and
       * scrolling back.
       *
       * From a grid the toast wins: it confirms without moving anyone, which
       * is the whole point of adding from a grid. The drawer still opens from
       * the product page, where the customer has finished choosing and going
       * to the cart is the natural next step. */
      toast.success(`Added to cart · ${chosen.title}`);
    });

    const wishBtn = card.querySelector('[data-action="wishlist"]');
    wishBtn?.addEventListener('click', () => {
      const active = store.toggleWishlist(product());
      toast.info(active ? 'Saved to wishlist' : 'Removed from wishlist');
      // The button is NOT painted here. syncWishlistHearts() below repaints
      // every card for this product, including this one — see why there.
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
