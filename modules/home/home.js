/**
 * home.js — page glue for index.html.
 *
 * Enhancement only. The page's structure, hero copy and category grid are all
 * real HTML. This module:
 *   - drives the hero carousel (auto-advance, pause-on-hover, arrows, dots)
 *   - fills the Premium / Best Sellers / New Arrivals product lists from
 *     catalog module (skeleton → data — product lists are inherently dynamic)
 *   - wires the rail scroll arrows and the testimonials slider
 *
 * Decision (context.md §6): product *lists* are rendered client-side because
 * catalog data is dynamic; all structural page content stays in HTML.
 */

import { getFeatured } from '../catalog/backend/api.js';
import { renderProductGrid } from '../../shared/js/components/product-card.js';
import { renderProductSkeletons } from '../../shared/js/components/skeleton-loader.js';
import { initScrollReveal } from '../../shared/js/components/scroll-reveal.js';

initHeroCarousel();
initCategoryGrid();
initProductSections();
initRailArrows();
initTestimonials();
initTrustMarquee();

/* ---- Hero carousel ----------------------------------------------------
   The banners and their timing come from the admin panel (modules/hero). The
   slides written into index.html are the fallback, and they are a real one:
   they render instantly, before any JavaScript, which is why the home page's
   largest image is never waiting on a request. If the panel holds banners, they
   replace the authored set — all of them, as a group, so a merchant is never
   looking at a mix of what they chose and what shipped with the site. */
function initHeroCarousel() {
  const viewport = document.querySelector('[data-hero]');
  if (!viewport) return;
  const hero = viewport.closest('.hero');
  let slides = [...viewport.querySelectorAll('[data-hero-slide]')];
  let dots = [...document.querySelectorAll('[data-hero-dot]')];
  let index = 0;
  let timer = null;
  let settings = {
    // Matches the CSS the authored markup ships with, so the carousel behaves
    // identically before the request answers and after it fails.
    intervalMs: 6000, transition: 'fade', transitionMs: 600,
    easing: 'ease-in-out', kenBurns: false, autoplay: true,
  };

  const show = (i) => {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, n) => s.classList.toggle('is-active', n === index));
    dots.forEach((d, n) => { d.classList.toggle('is-active', n === index); d.setAttribute('aria-selected', String(n === index)); });
  };
  const advance = () => show(index + 1);
  // .is-paused freezes the progress fill along with the timer — a bar that
  // keeps filling while the slide it measures is parked is worse than none.
  const start = () => {
    stop();
    hero.classList.remove('is-paused');
    // One banner is a picture, not a carousel, and a timer that fires to show
    // the slide already showing is a wasted wake-up every few seconds.
    if (!settings.autoplay || slides.length < 2) return;
    timer = setInterval(advance, settings.intervalMs);
  };
  const stop = () => { if (timer) clearInterval(timer); timer = null; hero.classList.add('is-paused'); };

  // Delegated, because the dots are rebuilt when the panel's banners arrive and
  // handlers bound to the old buttons would point at slides that no longer
  // exist.
  document.querySelector('.hero__dots')?.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-hero-dot]');
    if (!dot) return;
    show(dots.indexOf(dot));
    start();
  });

  // Pause on hover / focus (a considered detail).
  hero.addEventListener('mouseenter', stop);
  hero.addEventListener('mouseleave', start);
  hero.addEventListener('focusin', stop);
  hero.addEventListener('focusout', start);
  // Pause when tab is hidden.
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  show(0);
  start();

  /**
   * Swap in whatever the merchant has set, and apply how it should move.
   *
   * Deliberately after the authored carousel is already running: the built-in
   * banner is on screen and turning within its first frame, and this either
   * replaces it or changes nothing. A failed request, a deleted module or a
   * database without the migration all land in the same place — the site as it
   * was authored — which is what makes this safe to leave switched on.
   */
  (async () => {
    let payload;
    try {
      const res = await fetch('/api/hero');
      if (!res.ok) return;
      payload = await res.json();
    } catch {
      return;                       // no backend; the authored banners stand
    }

    applySettings(payload.meta?.settings);
    if (payload.meta?.ready && payload.data?.length) replaceSlides(payload.data);

    start();                        // pick up the new interval and slide count
  })();

  /**
   * Timing and movement as CSS custom properties on .hero.
   *
   * Set as variables rather than inline styles on each slide so the stylesheet
   * still owns HOW each transition looks — this only says which one and how
   * fast. --hero-interval also drives the dot's fill animation, which is why
   * the two can no longer drift: there is one number and both read it.
   */
  function applySettings(next) {
    if (!next) return;
    settings = { ...settings, ...next };

    hero.style.setProperty('--hero-interval', `${settings.intervalMs}ms`);
    hero.style.setProperty('--hero-transition', `${settings.transitionMs}ms`);
    hero.style.setProperty('--hero-easing',
      // "Springy" is not a CSS keyword; it is a curve that overshoots slightly.
      settings.easing === 'spring' ? 'cubic-bezier(.34,1.56,.64,1)' : settings.easing);

    hero.dataset.heroTransition = settings.transition;
    hero.classList.toggle('is-ken-burns', Boolean(settings.kenBurns));
  }

  function replaceSlides(list) {
    viewport.innerHTML = list.map((s, i) => {
      const picture = `
        <picture>
          <img class="hero__art" src="${escapeAttr(s.image)}" alt="${escapeAttr(s.alt || '')}"
               width="1600" height="800"
               loading="${i === 0 ? 'eager' : 'lazy'}"
               fetchpriority="${i === 0 ? 'high' : 'low'}" decoding="async">
        </picture>`;

      // A slide with nowhere to go is not wrapped in an anchor. An <a> without
      // an href is not a link, and one with href="#" is a link that lies.
      const body = `
        <picture aria-hidden="true"><img class="hero__backdrop" src="${escapeAttr(s.image)}" alt="" aria-hidden="true"></picture>
        <span class="hero__fit">${picture}</span>
        ${s.headline ? `<span class="hero__words"><strong>${escapeHtml(s.headline)}</strong>${
          s.subheadline ? `<span>${escapeHtml(s.subheadline)}</span>` : ''
        }</span>` : ''}`;

      return `
        <article class="hero__slide${i === 0 ? ' is-active' : ''}" data-hero-slide
                 aria-roledescription="slide" aria-label="${i + 1} of ${list.length}"
                 style="--arn:2; --ar:1600/800">
          ${s.href ? `<a class="hero__link" href="${escapeAttr(s.href)}">${body}</a>` : body}
        </article>`;
    }).join('');

    const dotHost = document.querySelector('.hero__dots');
    if (dotHost) {
      dotHost.innerHTML = list.map((_, i) =>
        `<button class="hero__dot${i === 0 ? ' is-active' : ''}" data-hero-dot aria-label="Slide ${i + 1}"></button>`
      ).join('');
      dots = [...dotHost.querySelectorAll('[data-hero-dot]')];
      dotHost.hidden = list.length < 2;
    }

    slides = [...viewport.querySelectorAll('[data-hero-slide]')];
    index = 0;
    show(0);
  }
}

/* The hero writes attribute values and text from merchant-entered content, so
   both go through an escape. textContent is not an option here — the markup is
   built as a string because it replaces the viewport wholesale. */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const escapeAttr = escapeHtml;

/**
 * One home-page shelf: what the merchant curated, or the old tag behaviour.
 *
 * The Highlights screen in the admin panel decides the products and their
 * order. That is a separate module, and this deliberately does not import it:
 * a `fetch` that 404s is a fallback, an `import` that fails is a blank home
 * page. Deleting modules/highlights/ has to cost the curation and nothing else.
 *
 * The server already falls back to the tag when a shelf is empty, so the
 * `catch` here is for the endpoint being absent entirely.
 */
async function shelf(rail, limit) {
  try {
    const res = await fetch(`/api/highlights/${rail}`, {
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      const { data } = await res.json();
      if (Array.isArray(data) && data.length) return data.slice(0, limit);
    }
  } catch {
    // Offline, or no API. Fall through.
  }

  return getFeatured(rail, limit);
}

/**
 * A shelf ONLY when the merchant has actually curated it — null otherwise.
 *
 * Best Sellers needs the distinction shelf() doesn't make. That grid is real
 * authored HTML in index.html: the no-JS content, the SEO content, and the
 * no-backend fallback. Swapping it for client-rendered cards is only an
 * improvement when the replacement is something a person chose — the server
 * says so with `source: "curated"`. A tag fallback would repaint the same
 * products with none of the static markup's benefits, so it is not taken.
 */
async function curatedShelf(rail, limit) {
  try {
    const res = await fetch(`/api/highlights/${rail}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const { data, source } = await res.json();
    if (source === 'curated' && Array.isArray(data) && data.length) {
      return data.slice(0, limit);
    }
  } catch {
    // Offline, or no API — the authored HTML stands.
  }
  return null;
}

/* ---- Category grid (authored HTML → live categories) ------------------
 *
 * The header and footer build their category lists from the API, so switching
 * a category on in the admin changed them immediately — while this grid, being
 * authored markup, stayed at whatever was last hand-edited. Eight categories
 * live, seven tiles on the home page. Whichever number was right, two numbers
 * on one page is a bug, and it recurs every time the merchant touches the
 * admin, so the grid reads the same source the menus do.
 *
 * The authored markup is NOT redundant: it is the no-JS content, the SEO
 * content, and the fallback when the API is down. It is only replaced when the
 * API answers with a list that actually differs.
 */
const CAT_ICONS = {
  'oil-ghee': '<path d="M10 2h4v3l3.2 3.6A4 4 0 0 1 18 11v8.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5V11a4 4 0 0 1 .8-2.4L10 5z"/><path d="M6 13h12"/>',
  'chocolates-dairy': '<path d="M4 6h16v12H4z"/><path d="M4 12h16M10 6v12M16 6v12"/>',
  'home-decor': '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5.5h5V20"/>',
  'kitchen-appliances': '<path d="M5 3h14v18H5z"/><path d="M5 9h14"/><circle cx="12" cy="15" r="3.2"/><path d="M8 6h3"/>',
  'dates-nuts': '<ellipse cx="12" cy="14.5" rx="4.5" ry="6.5"/><path d="M12 8V4.5"/><path d="M12 6c1.6-2.2 4.4-2.4 4.4-2.4s.2 2.8-1.9 4"/>',
  'kids-toys': '<rect x="3" y="12" width="9" height="9" rx="1.2"/><circle cx="17" cy="16.5" r="4.5"/><path d="M7.5 3 4 9.5h7z"/>',
  'fashion-clothes': '<path d="M9 3 4.5 5.5 6 10l2-1v12h8V9l2 1 1.5-4.5L15 3a3 3 0 0 1-6 0z"/>',
  'flash-sale': '<path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z"/>',
  /* A category the merchant adds later gets a plain tag rather than no icon —
     an empty box next to seven drawn ones reads as a broken tile. */
  _fallback: '<path d="M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7z"/><circle cx="8" cy="8" r="1.4"/>',
};

/* Flash Sale is a real category the admin can switch, but its tile goes to the
   deals page, which already lists every discounted product. */
const CAT_HREF = { 'flash-sale': '/modules/deals/deals.html' };

/* The photographic tile art, by slug. Deliberately keyed here rather than read
   from `c.image`: CatalogSeeder only writes that column when it CREATES a row,
   so a shop seeded before the photographs existed still reports the old SVG
   path, and the home page would show one thing while the files say another.
   Art we ship wins; `c.image` is the fallback for a category the merchant
   added themselves, and the icon is the fallback for that. */
/* Stamped by tools/gen-category-images.py from a hash of the delivered bytes.
   The tiers have fixed names, so without this a cache cannot tell that the art
   behind a URL changed — and one did survive 55 minutes at the edge under a
   `max-age` of a week. Do not hand-edit; re-run the generator. */
const ART_V = '2477f36b';

const CAT_ART = new Set([
  'oil-ghee', 'chocolates-dairy', 'home-decor', 'kitchen-appliances',
  'dates-nuts', 'kids-toys', 'fashion-clothes', 'flash-sale',
]);

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* The picture, the icon behind it, and the well that holds both — the same
   structure index.html authors by hand. The icon is not a spare: it is what
   the well shows when the photograph 404s or the request never lands.
   DOM order and CSS put the icon underneath, but they cannot uncover it: a
   broken <img> is still painted — an opaque background plus the browser's own
   torn-page glyph — so blocking the photos gave eight broken-image marks and
   no icons at all. The one-line onerror is what actually removes it. */
function categoryMedia(c, icon) {
  const art = CAT_ART.has(c.slug) ? `/assets/images/categories/${c.slug}` : null;
  const V = ART_V ? `?v=${ART_V}` : '';
  const pic = art
    ? `<picture><source srcset="${art}-160.webp${V} 160w, ${art}-280.webp${V} 280w, ${art}-560.webp${V} 560w"`
      /* Measured, not guessed: the well is 66px on a 390px phone and 131px in
         the eight-across desktop row, so these pick the 160w and 280w tiers at
         2x with no upscaling. Re-measure if the grid's column count changes. */
      + ` sizes="(max-width: 767px) 18vw, 140px" type="image/webp">`
      + `<img class="category-card__img" onerror="this.hidden=true" src="${art}.jpg${V}" alt="" width="1024" height="1024" loading="lazy" decoding="async"></picture>`
    : (c.image ? `<img class="category-card__img" onerror="this.hidden=true" src="${esc(c.image)}" alt="" loading="lazy" decoding="async">` : '');
  return `<span class="category-card__media">`
    + `<svg class="category-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${icon}</svg>`
    + `${pic}</span>`;
}

function categoryTile(c) {
  const href = CAT_HREF[c.slug] ?? `/modules/catalog/category.html?slug=${encodeURIComponent(c.slug)}`;
  const icon = CAT_ICONS[c.slug] ?? CAT_ICONS._fallback;
  const blurb = c.blurb ? `<span class="category-card__count">${esc(c.blurb)}</span>` : '';
  return `<a class="category-card" href="${esc(href)}" data-reveal>`
    + categoryMedia(c, icon)
    + `<h3 class="category-card__title">${esc(c.name)}</h3>${blurb}</a>`;
}

async function initCategoryGrid() {
  const grid = document.querySelector('.home-cat-grid');
  if (!grid) return;

  let cats;
  try {
    const res = await fetch('/api/catalog/categories', { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const body = await res.json();
    cats = Array.isArray(body?.data) ? body.data : body;
  } catch {
    return; // Offline, or no API — the authored tiles stand.
  }
  if (!Array.isArray(cats) || !cats.length) return;

  // Repainting eight identical tiles would restart their reveal for nothing,
  // so the common case — admin and markup agree — costs one comparison.
  // Both sides go through the URL parser first: the authored Flash Sale tile
  // is a relative "modules/deals/deals.html" and the generated one is rooted,
  // and comparing the raw strings made every load a mismatch. The grid faded
  // in, blanked, and faded in again a second later, on every visit.
  const key = (href) => {
    const u = new URL(href, location.href);
    return u.searchParams.get('slug') || u.pathname;
  };
  const authored = [...grid.querySelectorAll('.category-card')].map((a) => key(a.getAttribute('href')));
  const live = cats.map((c) => key(CAT_HREF[c.slug]
    ?? `/modules/catalog/category.html?slug=${encodeURIComponent(c.slug)}`));
  if (authored.join('|') === live.join('|')) return;

  // Has the visitor already watched this grid arrive? Then the API is late and
  // replaying the animation would look like a glitch, not a flourish — the new
  // tiles go straight to visible. Only a grid still below the fold gets to
  // animate. Either way they must be handled: [data-reveal] starts at opacity
  // 0, so tiles built after scroll-reveal ran would otherwise paint themselves
  // invisible — exactly the failure this is replacing.
  const alreadyRevealed = !!grid.querySelector('.category-card.is-visible');
  grid.innerHTML = cats.map(categoryTile).join('');
  if (alreadyRevealed) {
    grid.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-visible'));
  } else {
    initScrollReveal(grid.closest('.home-cat') || grid.parentElement);
  }
}

/* ---- Product sections (skeleton → data) ------------------------------- */
async function initProductSections() {
  const premiumRail = document.querySelector('[data-rail="premium"]');
  const newRail = document.querySelector('[data-rail="new"]');
  // Best Sellers stays authored HTML until the merchant curates the
  // 'bestseller' shelf in the Home page screen — then their picks replace it,
  // in their order. No skeleton for it: the static grid is already content,
  // and blanking real cards to show placeholders would be a downgrade.
  const bestGrid = document.querySelector('[data-grid="bestseller"]');

  if (premiumRail) renderProductSkeletons(premiumRail, 6);
  if (newRail) renderProductSkeletons(newRail, 6);

  if (bestGrid) {
    curatedShelf('bestseller', 8).then((picks) => {
      if (picks) renderProductGrid(bestGrid, picks);
    }).catch(() => {});
  }

  try {
    const [premium, fresh] = await Promise.all([
      shelf('premium', 8),
      shelf('new', 8),
    ]);
    if (premiumRail) renderProductGrid(premiumRail, premium);
    if (newRail) renderProductGrid(newRail, fresh);
    // Only once there are cards to measure: the recycler works in card widths
    // and an empty rail has none. Both shelves march — they are the same kind
    // of thing, and one moving beside one standing still looks like the still
    // one is broken.
    if (premiumRail) { padRailForMarch(premiumRail, premium); initRailAutoplay(premiumRail); }
    if (newRail) { padRailForMarch(newRail, fresh); initRailAutoplay(newRail); }
  } catch (err) {
    console.error('[home] failed to load products', err);
    [premiumRail, newRail].forEach((el) => {
      if (el) el.innerHTML = '<p class="text-muted-gr">Couldn’t load products. Please refresh.</p>';
    });
  }
}

/* ---- Rail scroll arrows -----------------------------------------------
 *
 * A rail marked [data-rail-autoplay] owns its own arrows — it steps by exactly
 * one product and recycles cards as they leave, and a stray scrollBy() of 80%
 * of the viewport would land it between two cards with the recycler none the
 * wiser. Skipped here, wired in initRailAutoplay instead.
 */
function initRailArrows() {
  const claimed = (rail) => !rail || rail.hasAttribute('data-rail-autoplay');

  document.querySelectorAll('[data-rail-next]').forEach((btn) => {
    const rail = document.querySelector(`[data-rail="${btn.dataset.railNext}"]`);
    if (claimed(rail)) return;
    btn.addEventListener('click', () => rail.scrollBy({ left: rail.clientWidth * 0.8, behavior: 'smooth' }));
  });
  document.querySelectorAll('[data-rail-prev]').forEach((btn) => {
    const rail = document.querySelector(`[data-rail="${btn.dataset.railPrev}"]`);
    if (claimed(rail)) return;
    btn.addEventListener('click', () => rail.scrollBy({ left: -rail.clientWidth * 0.8, behavior: 'smooth' }));
  });
}

/* ---- A rail that advances itself ---------------------------------------
 *
 * Premium Picks shows one and a half cards on a phone and gives no sign the
 * other six exist: .snap-rail hides its scrollbar and the arrows live up in the
 * section header, nowhere near a thumb. So the shelf walks itself leftward, one
 * product at a time, and the motion is the affordance.
 *
 * THE LOOP IS A TREADMILL, NOT A CLONE. The obvious way to loop a scroll rail
 * is to duplicate the set and jump back a set-width when you pass it — that is
 * what initTrustMarquee does, and it is right there because the items are four
 * static headings. These are product cards: cloning them would put two Add to
 * Cart buttons, two wishlist toggles and two of every product URL in the DOM,
 * with a wired copy and an aria-hidden copy of each. So nothing is duplicated.
 * A card that has scrolled entirely off the left is moved to the end with
 * appendChild — which MOVES the node, keeping its listeners and its wishlist
 * state — and scrollLeft is reduced by the width it vacated in the same frame.
 * Everything sits exactly where it was, and the rail never runs out of runway.
 *
 * THE TRAVEL IS A rAF TWEEN, NOT scroll-behavior: smooth. The brief is 400ms
 * per product; `smooth` picks its own duration (Chrome scales it with distance,
 * Firefox has its own curve) and exposes no completion event, so the recycle
 * step would have to guess when to run. 400ms of quartic ease-out is also a
 * better curve than any browser default for this: it leaves quickly and lands
 * slowly, which is what makes a moving shelf feel weighted rather than swept.
 */
const RAIL_STEP_MS = 400;    // one product's travel — the specified figure
/* No RAIL_HOLD_MS any more: the shelves drift continuously rather than
   stepping and dwelling, so there is nothing to dwell for. The arrows still
   step, and still take RAIL_STEP_MS. */
const RAIL_RESUME_MS = 4500; // quiet time before it takes over from a finger

/* Mirrors --ease-out (cubic-bezier(.16,1,.3,1)) closely enough that the CSS
   fades and the JS travel read as the same gesture, without a bezier solver. */
const easeOut = (t) => 1 - Math.pow(1 - t, 4);

/**
 * Give a shelf enough cards to march.
 *
 * A marquee needs more content than the viewport, and on a 1440px screen four
 * premium products fill the track exactly — measured maxScroll of 0. There is
 * nothing to scroll, so the rail stood still on desktop while the phone
 * marched, which reads as the desktop one being broken.
 *
 * So the set repeats until it overflows. The repeats are REAL cards from the
 * same renderer, not aria-hidden decorations: the trust band can clone its
 * headings because they do nothing, but a dead Add to Cart button that looks
 * live is worse than no marquee. Every copy is fully wired, and wishlist state
 * stays consistent across them because the hearts are driven from the store
 * (see syncWishlistHearts in product-card.js) rather than by whichever button
 * was clicked.
 *
 * Bounded at 4 passes. If a shelf still cannot overflow after four — a single
 * product, or a container that has not laid out — it is left alone and simply
 * does not march, which is the honest outcome for a shelf with nothing to
 * show past its own edge.
 */
function padRailForMarch(rail, products) {
  if (!rail || !products?.length) return;

  const gap = () => parseFloat(getComputedStyle(rail).columnGap) || 0;
  const cardW = () => (rail.firstElementChild?.getBoundingClientRect().width || 0) + gap();

  // Two cards of runway past the edge — the same threshold canLoop() uses, so
  // this either satisfies it or gives up rather than half-filling the rail.
  const enough = () => rail.scrollWidth - rail.clientWidth >= cardW() * 2;

  for (let pass = 0; pass < 4 && !enough(); pass++) {
    if (cardW() < 1) return;                 // not laid out; nothing to measure
    renderProductGrid(rail, [...products, ...Array.from(
      { length: (pass + 2) * products.length }, (_, i) => products[i % products.length])]);
  }
}

function initRailAutoplay(rail) {
  if (!rail || rail.dataset.autoplayReady) return;

  // Mobile only, per the brief — but re-evaluated on rotation rather than read
  // once, so a phone turned to landscape and back behaves.
  const phone = window.matchMedia('(max-width: 767.98px)');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  rail.dataset.autoplayReady = 'true';

  const gap = () => parseFloat(getComputedStyle(rail).columnGap) || 0;
  const stepOf = (el) => (el ? el.getBoundingClientRect().width + gap() : 0);
  const maxScroll = () => rail.scrollWidth - rail.clientWidth;

  /* Two cards do not make a carousel, and worse, they make a broken one: the
     tween would be clamped at maxScroll partway through and the rail would
     stall mid-card with the recycler waiting on travel that never happened.
     Below the threshold it stays a plain swipeable rail. */
  const canLoop = () => rail.children.length >= 4 && maxScroll() >= stepOf(rail.firstElementChild) * 2;

  /* Every write to scrollLeft below happens with .is-stepping on the rail,
     which switches scroll-snap off for the duration.
     THIS IS NOT OPTIONAL. scroll-snap-type: x mandatory re-snaps after every
     programmatic scroll, so a tween that starts ON a snap point has each of its
     frames dragged straight back to it — the rail sits perfectly still for
     400ms and only the recycle at the end moves anything. That is exactly what
     the arrows did before this: card order changed, nothing animated. */
  let cancelTween = null;
  const tweenTo = (to) => new Promise((resolve) => {
    const from = rail.scrollLeft;
    const dist = to - from;
    if (Math.abs(dist) < 1) return resolve();
    let t0 = null;
    let frame = null;
    const done = () => { frame = null; cancelTween = null; resolve(); };
    // Cancelling RESOLVES rather than abandoning: whoever is awaiting this owns
    // the `busy` flag, and a promise that never settles strands it forever.
    cancelTween = () => { if (frame) cancelAnimationFrame(frame); done(); };
    const tick = (now) => {
      if (t0 === null) t0 = now;
      const p = Math.min(1, (now - t0) / RAIL_STEP_MS);
      rail.scrollLeft = from + dist * easeOut(p);
      if (p < 1) frame = requestAnimationFrame(tick);
      else done();
    };
    frame = requestAnimationFrame(tick);
  });

  const stepping = async (run) => {
    rail.classList.add('is-stepping');
    try { await run(); } finally { rail.classList.remove('is-stepping'); }
  };

  /* Send every card that is now fully behind the left edge to the back of the
     queue, paying back its width so the view does not jump. Bounded by the
     child count: a zero-width card (an image that failed to lay out) would
     otherwise spin this forever. */
  const recycle = () => {
    for (let guard = rail.children.length; guard > 0; guard--) {
      const first = rail.firstElementChild;
      const w = stepOf(first);
      if (!first || w < 1 || rail.scrollLeft < w - 1) break;
      rail.appendChild(first);
      rail.scrollLeft -= w;
    }
  };

  const forward = () => stepping(async () => {
    if (!canLoop()) return;
    await tweenTo(Math.min(rail.scrollLeft + stepOf(rail.firstElementChild), maxScroll()));
    recycle();
  });

  /* Backwards has to borrow before it spends: the card that should slide in
     from the left is currently at the end, so it is moved to the front and paid
     for up front, then the rail travels back over it. */
  const backward = () => stepping(async () => {
    if (!canLoop()) return;
    const last = rail.lastElementChild;
    const w = stepOf(last);
    if (w < 1) return;
    rail.insertBefore(last, rail.firstElementChild);
    rail.scrollLeft += w;
    await tweenTo(Math.max(0, rail.scrollLeft - w));
  });

  /* ---- The drift ---------------------------------------------------------
   *
   * This used to step one card, wait 2.6s, step again. It read as a slideshow:
   * the shelf was either still or jumping, and on a wide screen where six
   * cards are already visible a jump every three seconds is just a flinch.
   *
   * It marches now, continuously, the same way the trust band under the hero
   * does — because that band is the reference the brief actually named. Same
   * direction, same unhurried rate, so the two read as one idea rather than
   * two different animations on one page.
   *
   * AND ON EVERY WIDTH. The step version was deliberately phone-only, on the
   * grounds that a desktop shows most of the shelf anyway. That was the wrong
   * call for a marquee: the point is not to reveal hidden cards, it is that a
   * shelf in motion looks like a shop with stock moving through it.
   *
   * The treadmill underneath is unchanged and is why this is affordable. The
   * trust band clones its four items; cloning THESE would put two Add to Cart
   * buttons, two wishlist toggles and two copies of every product URL in the
   * DOM. recycle() moves the node instead, so listeners and wishlist state
   * travel with it and nothing is duplicated.
   */
  const DRIFT_PX_PER_SEC = 26;   // ~ the trust band's rate; readable at a glance
  const MAX_FRAME_MS = 64;       // clamp after a tab switch, or it lurches

  let busy = false;
  let hovered = false;
  let touched = false;
  let inView = true;
  let resumeTimer = null;
  let frame = null;
  let lastTs = null;

  /* THE POSITION IS KEPT HERE, IN A FLOAT, AND scrollLeft IS ONLY EVER
     WRITTEN — never read back and added to.
     At 26px/s a 60Hz frame advances 0.43px, and `rail.scrollLeft += 0.43`
     moves nothing at all: the getter returns a rounded integer, so every
     frame adds 0.43 to the same 0 and writes a value that rounds straight
     back. Measured — sixty increments produced exactly zero travel, which is
     why the first version of this looked like it simply did not run.
     Owning the sub-pixel position is the whole fix. */
  let pos = 0;

  const active = () => !still.matches;
  const canPlay = () => active() && inView && !hovered && !touched && !document.hidden && canLoop();

  /* .is-stepping switches scroll-snap off. Mandatory snapping drags every
     programmatic write back to the nearest snap point, so with it on the rail
     would sit perfectly still while this loop spent its whole budget being
     undone — the same trap the old tween documented. */
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    lastTs = null;
    rail.classList.remove('is-stepping');
  };

  /* recycle() works off rail.scrollLeft, which is the rounded value — so the
     drift needs its own, driven by `pos`. Sends every card fully behind the
     left edge to the back and pays its width back, so `pos` only ever ranges
     over the width of the leading card and maxScroll is never reached. The
     guard bounds it by the child count: a zero-width card (an image that
     failed to lay out) would otherwise spin this forever. */
  const recycleDrift = () => {
    for (let guard = rail.children.length; guard > 0; guard--) {
      const first = rail.firstElementChild;
      const w = stepOf(first);
      if (!first || w < 1 || pos < w) break;
      rail.appendChild(first);
      pos -= w;
    }
  };

  const tick = (now) => {
    if (!canPlay()) { stop(); return; }
    if (lastTs !== null) {
      pos += DRIFT_PX_PER_SEC * Math.min(MAX_FRAME_MS, now - lastTs) / 1000;
      recycleDrift();
      rail.scrollLeft = pos;
    }
    lastTs = now;
    frame = requestAnimationFrame(tick);
  };

  const schedule = () => {
    if (!canPlay()) return stop();
    if (frame) return;                       // already marching
    rail.classList.add('is-stepping');
    lastTs = null;
    // Resync from the DOM: a finger, an arrow tap or a resize may have moved
    // the rail while this was parked, and resuming from a stale float would
    // jump it back to wherever the drift last left off.
    pos = rail.scrollLeft;
    frame = requestAnimationFrame(tick);
  };

  /* A finger takes precedence and keeps it for a few seconds after letting go —
     a shelf that starts moving again the instant you stop dragging is a shelf
     that is arguing with you. */
  const hold = () => {
    touched = true;
    stop();
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(async () => {
      touched = false;
      /* Re-align to a card edge before taking over. A swipe ends wherever the
         finger left it, and without this the treadmill inherits that half-card
         offset and carries it for the rest of the session — every subsequent
         step lands a fixed few pixels wrong. */
      await stepping(async () => {
        recycle();
        const w = stepOf(rail.firstElementChild);
        if (w < 1 || rail.scrollLeft <= 0.5) return;
        await tweenTo(rail.scrollLeft > w / 2 ? Math.min(w, maxScroll()) : 0);
        recycle();
      });
      schedule();
    }, RAIL_RESUME_MS);
  };

  /* A gesture also stops whatever is mid-flight — a tween still writing
     scrollLeft under a moving finger is the rail fighting the user. */
  const handoff = () => { cancelTween?.(); hold(); };

  ['pointerdown', 'touchstart', 'wheel'].forEach((evt) =>
    rail.addEventListener(evt, handoff, { passive: true }));

  // Hover/focus pause is for the pointer case only — on touch, :hover latches
  // and would freeze the rail permanently after one tap.
  if (window.matchMedia('(hover: hover)').matches) {
    rail.addEventListener('pointerenter', () => { hovered = true; schedule(); });
    rail.addEventListener('pointerleave', () => { hovered = false; schedule(); });
  }
  rail.addEventListener('focusin', () => { hovered = true; schedule(); });
  rail.addEventListener('focusout', () => { hovered = false; schedule(); });

  document.addEventListener('visibilitychange', schedule);
  phone.addEventListener('change', schedule);
  still.addEventListener('change', schedule);
  window.addEventListener('resize', schedule);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; schedule(); },
      { threshold: 0.35 }).observe(rail);
  }

  /* The arrows initRailArrows deliberately left alone. They drive the same two
     functions, so a tap and an autoplay tick are the same 400ms movement — and
     tapping one hands control over exactly as a swipe does.
     hold(), not handoff(): a tap is a request for one more step, not an
     interruption of the one in flight, so the current tween is left to land. */
  const arrow = (sel, run) => document.querySelector(sel)?.addEventListener('click', async () => {
    hold();
    if (busy) return;
    busy = true;
    await run();
    busy = false;
  });
  arrow(`[data-rail-next="${rail.dataset.rail}"]`, forward);
  arrow(`[data-rail-prev="${rail.dataset.rail}"]`, backward);

  schedule();
}

/* ---- Trust marquee (phones) -------------------------------------------
 *
 * Below 768px the four trust claims are laid out as one travelling row
 * (modules/home/home.css). CSS can do the layout and the loop; it cannot do
 * the two things below.
 *
 *   1. THE CLONE. A seamless loop needs the set present twice — the track
 *      translates by exactly -50% and the second copy is already where the
 *      first one was. Writing that duplicate into index.html would ship four
 *      extra headings to every screen reader, crawler and Reader Mode on every
 *      screen size, to serve a phone-only visual. So it's cloned here, marked
 *      aria-hidden, and hidden outright above 768px.
 *
 *   2. THE COUPLING TO SCROLL. The band drifts by itself, and any vertical
 *      scrolling — up OR down — surges it leftward, then it eases back to the
 *      drift over about a second. Direction is ignored on purpose: this is a
 *      ribbon that reacts to the page being read, not a scrubber that runs
 *      backwards when you go back up. Reading down the page and flicking back
 *      to the hero should both feel like they push it along.
 *
 * Speed is changed via the Web Animations API rather than by rewriting
 * `animation-duration`: swapping the duration on a running CSS animation
 * re-maps its progress and the row jumps sideways. playbackRate leaves the
 * current position alone and only changes how fast it advances from here.
 */
function initTrustMarquee() {
  const marquee = document.querySelector('[data-trust-marquee]');
  const track = marquee?.querySelector('[data-trust-track]');
  if (!track) return;
  // No loop at all under reduced motion — the CSS falls back to a swipeable
  // row, and without the clones there is nothing extra to swipe past.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* scroll-reveal observes each of the four items individually. Once the row is
     a clipping track, items three and four are outside it at load and an
     IntersectionObserver reports anything clipped by an ancestor as not
     intersecting — so they never got .is-visible and looped past at opacity 0.
     On phones the band's own travel is the entrance; take the per-item reveal
     off it and let the desktop grid keep its stagger. */
  const phone = window.matchMedia('(max-width: 767.98px)');
  const originals = [...track.children];
  const settle = () => {
    if (phone.matches) originals.forEach((el) => el.classList.add('is-visible'));
  };
  settle();
  phone.addEventListener('change', settle);

  originals.forEach((item) => {
    const clone = item.cloneNode(true);
    clone.classList.add('trust-marquee__clone');
    clone.setAttribute('aria-hidden', 'true');
    // Decoration must not wait on the reveal observer — that only ever fires
    // for the elements it was handed, so a clone carrying [data-reveal] would
    // stay at opacity 0 forever and the loop would show four blanks.
    clone.removeAttribute('data-reveal');
    clone.style.removeProperty('--reveal-delay');
    track.appendChild(clone);
  });
  marquee.classList.add('is-looping');

  const DRIFT = 1;      // resting rate: ~23px/s, slow enough to read at a glance
  const MAX = 9;        // ceiling on a hard fling
  const GAIN = 0.5;     // multiples of DRIFT per px scrolled in one frame
  const DECAY = 0.9;    // per frame, back toward DRIFT

  let anim = null;
  let rate = DRIFT;
  let lastY = window.scrollY;
  let frame = null;

  /* Re-resolved rather than cached once: the animation does not exist above
     768px, so on a phone rotated to landscape or a resized desktop window this
     picks it up whenever the media query starts applying. */
  const running = () => {
    if (!anim || anim.playState === 'idle') {
      const found = track.getAnimations();
      anim = found.find((a) => a.animationName === 'trust-marquee') || found[0] || null;
    }
    return anim;
  };

  const setRate = (r) => {
    const a = running();
    if (!a) return;
    if (typeof a.updatePlaybackRate === 'function') a.updatePlaybackRate(r);
    else a.playbackRate = r;
  };

  const ease = () => {
    rate = DRIFT + (rate - DRIFT) * DECAY;
    if (rate - DRIFT > 0.02) {
      setRate(rate);
      frame = requestAnimationFrame(ease);
    } else {
      rate = DRIFT;
      setRate(DRIFT);
      frame = null;          // idle again — no rAF loop ticking for nothing
    }
  };

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const delta = Math.abs(y - lastY);
    lastY = y;
    if (delta < 1) return;
    // max(): a fast flick shouldn't be damped by the frame that follows it.
    rate = Math.min(MAX, Math.max(rate, DRIFT + delta * GAIN));
    setRate(rate);
    if (!frame) frame = requestAnimationFrame(ease);
  }, { passive: true });

  // Don't animate a band nobody can see — it is offscreen for most of the page,
  // and for the whole of a backgrounded tab. `inView` is kept so returning to
  // the tab can resume it; the observer will not fire again on its own.
  let inView = true;
  const sync = () => {
    const a = running();
    if (!a) return;
    if (inView && !document.hidden) a.play();
    else a.pause();
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); },
      { threshold: 0 }).observe(marquee);
  }
  document.addEventListener('visibilitychange', sync);
}

/* ---- Testimonials slider ---------------------------------------------- */
function initTestimonials() {
  const track = document.querySelector('[data-testi-track]');
  if (!track) return;
  const cards = [...track.children];
  const prev = document.querySelector('[data-testi-prev]');
  const next = document.querySelector('[data-testi-next]');
  let i = 0;
  const go = (n) => { i = (n + cards.length) % cards.length; cards[i].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); };
  next?.addEventListener('click', () => go(i + 1));
  prev?.addEventListener('click', () => go(i - 1));
}
