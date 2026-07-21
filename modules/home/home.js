/**
 * home.js — page glue for index.html.
 *
 * Enhancement only. The page's structure, hero copy and category grid are all
 * real HTML. This module:
 *   - drives the hero carousel (auto-advance, pause-on-hover, arrows, dots)
 *   - fills the Premium / Best Sellers / New Arrivals product lists from
 *     data-service (skeleton → data — product lists are inherently dynamic)
 *   - wires the rail scroll arrows and the testimonials slider
 *
 * Decision (context.md §6): product *lists* are rendered client-side because
 * catalog data is dynamic; all structural page content stays in HTML.
 */

import { getFeatured } from '../../shared/js/core/data-service.js';
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

/* ---- Product sections (skeleton → data) ------------------------------- */
async function initProductSections() {
  const premiumRail = document.querySelector('[data-rail="premium"]');
  const bestGrid = document.querySelector('[data-grid="bestseller"]');
  const newRail = document.querySelector('[data-rail="new"]');

  if (premiumRail) renderProductSkeletons(premiumRail, 6);
  if (bestGrid) renderProductSkeletons(bestGrid, 8);
  if (newRail) renderProductSkeletons(newRail, 6);

  try {
    const [premium, best, fresh] = await Promise.all([
      getFeatured('premium', 8),
      getFeatured('bestseller', 8),
      getFeatured('new', 8),
    ]);
    if (premiumRail) renderProductGrid(premiumRail, premium);
    if (bestGrid) renderProductGrid(bestGrid, best);
    if (newRail) renderProductGrid(newRail, fresh);
  } catch (err) {
    console.error('[home] failed to load products', err);
    [premiumRail, bestGrid, newRail].forEach((el) => {
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
