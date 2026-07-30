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

initHeroCarousel();
initProductSections();
initRailArrows();
initTestimonials();

/* ---- Hero carousel ---------------------------------------------------- */
function initHeroCarousel() {
  const viewport = document.querySelector('[data-hero]');
  if (!viewport) return;
  const slides = [...viewport.querySelectorAll('[data-hero-slide]')];
  const dots = [...document.querySelectorAll('[data-hero-dot]')];
  const prev = document.querySelector('[data-hero-prev]');
  const next = document.querySelector('[data-hero-next]');
  let index = 0;
  let timer = null;
  const INTERVAL = 6000;

  const show = (i) => {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, n) => s.classList.toggle('is-active', n === index));
    dots.forEach((d, n) => { d.classList.toggle('is-active', n === index); d.setAttribute('aria-selected', String(n === index)); });
  };
  const advance = () => show(index + 1);
  const start = () => { stop(); timer = setInterval(advance, INTERVAL); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };

  next?.addEventListener('click', () => { advance(); start(); });
  prev?.addEventListener('click', () => { show(index - 1); start(); });
  dots.forEach((d, n) => d.addEventListener('click', () => { show(n); start(); }));

  // Pause on hover / focus (a considered detail).
  viewport.closest('.hero').addEventListener('mouseenter', stop);
  viewport.closest('.hero').addEventListener('mouseleave', start);
  viewport.closest('.hero').addEventListener('focusin', stop);
  viewport.closest('.hero').addEventListener('focusout', start);
  // Pause when tab is hidden.
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  show(0);
  start();
}

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

/* ---- Product sections (skeleton → data) ------------------------------- */
async function initProductSections() {
  const premiumRail = document.querySelector('[data-rail="premium"]');
  const newRail = document.querySelector('[data-rail="new"]');
  // Best Sellers are authored as real HTML in index.html (content-first) and
  // enhanced by main.js — we don't render them here. Only the dynamic rails load.

  if (premiumRail) renderProductSkeletons(premiumRail, 6);
  if (newRail) renderProductSkeletons(newRail, 6);

  try {
    const [premium, fresh] = await Promise.all([
      shelf('premium', 8),
      shelf('new', 8),
    ]);
    if (premiumRail) renderProductGrid(premiumRail, premium);
    if (newRail) renderProductGrid(newRail, fresh);
  } catch (err) {
    console.error('[home] failed to load products', err);
    [premiumRail, newRail].forEach((el) => {
      if (el) el.innerHTML = '<p class="text-muted-gr">Couldn’t load products. Please refresh.</p>';
    });
  }
}

/* ---- Rail scroll arrows ----------------------------------------------- */
function initRailArrows() {
  document.querySelectorAll('[data-rail-next]').forEach((btn) => {
    const rail = document.querySelector(`[data-rail="${btn.dataset.railNext}"]`);
    btn.addEventListener('click', () => rail?.scrollBy({ left: rail.clientWidth * 0.8, behavior: 'smooth' }));
  });
  document.querySelectorAll('[data-rail-prev]').forEach((btn) => {
    const rail = document.querySelector(`[data-rail="${btn.dataset.railPrev}"]`);
    btn.addEventListener('click', () => rail?.scrollBy({ left: -rail.clientWidth * 0.8, behavior: 'smooth' }));
  });
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
