/**
 * search-autocomplete — debounced suggestions under any search input.
 * Attach to a container that holds an input + a results panel:
 *
 *   <form data-search role="search" action="/modules/catalog/search-results.html">
 *     <input name="q" data-search-input autocomplete="off">
 *     <div data-search-results class="search-suggest" hidden></div>
 *   </form>
 *
 * Submitting navigates to the search-results page (real page, real URL) — the
 * suggestions are pure enhancement.
 */

import { suggest, getDeals } from '../../../modules/catalog/backend/api.js';
import { loadJSON } from '../core/json-cache.js';
import { productURL, siteURL } from '../core/paths.js';
import { debounce } from '../utils/debounce.js';
import { formatBDT } from '../utils/format-currency.js';

export function initSearchAutocomplete(root = document) {
  root.querySelectorAll('[data-search]').forEach(setup);
}

function setup(form) {
  if (form.dataset.ready) return;
  form.dataset.ready = 'true';
  const input = form.querySelector('[data-search-input]');
  const panel = form.querySelector('[data-search-results]');
  if (!input || !panel) return;

  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { panel.hidden = true; panel.innerHTML = ''; return; }
    try {
      const items = await suggest(q, 6);
      if (!items.length) {
        panel.innerHTML = `<p class="caption" style="padding:.75rem 1rem">No matches for “${escapeHtml(q)}”.</p>`;
      } else {
        panel.innerHTML = items.map((it) => `
          <a class="search-suggest__item" href="${productURL(encodeURIComponent(it.id))}">
            <img src="${it.image}" alt="" width="40" height="40" loading="lazy">
            <span><span class="search-suggest__title">${escapeHtml(it.title)}</span>
            <span class="caption">${escapeHtml(it.brand || '')}</span></span>
          </a>`).join('');
      }
      panel.hidden = false;
    } catch { panel.hidden = true; }
  }, 220);

  input.addEventListener('input', run);

  // Focused but empty: offer the ways people actually ask, rather than a blank
  // panel. Shajgoj returns concern-shaped suggestions ("lipstick for dry lips"),
  // not prefix completions, and that is what makes them worth tapping.
  input.addEventListener('focus', async () => {
    if (input.value.trim()) { if (panel.innerHTML) panel.hidden = false; return; }
    const popular = await loadPopular();
    if (!popular.length) return;
    panel.innerHTML = `
      <p class="search-suggest__heading">Popular searches</p>
      ${popular.map((s) => `
        <a class="search-suggest__item search-suggest__item--query"
           href="${siteURL(`search?q=${encodeURIComponent(s.q)}`)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <span>${escapeHtml(s.label)}</span>
        </a>`).join('')}`;
    panel.hidden = false;
  });

  startPlaceholderRotation(input);
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) panel.hidden = true; });

  form.addEventListener('submit', (e) => {
    const q = input.value.trim();
    if (!q) { e.preventDefault(); return; }
    // Let the form navigate to search-results.html?q=... (default GET behaviour).
  });
}

/* ---- Popular queries --------------------------------------------------- */

let popularCache = null;

async function loadPopular() {
  if (popularCache) return popularCache;
  try {
    const { popular } = await loadJSON(siteURL('modules/catalog/data/search-suggestions.json'));
    // Every entry is asserted to return >=1 product by
    // tools/check-search-suggestions.py — a suggestion leading to an empty
    // results page teaches the customer the search is broken.
    popularCache = popular ?? [];
  } catch {
    popularCache = [];
  }
  return popularCache;
}

/* ---- Merchandised placeholder ------------------------------------------ */

/**
 * Rotate the placeholder through live deals.
 *
 * Shajgoj merchandise inside the search box — their placeholder currently reads
 * "Ordinary Niacinamide @1099tk, AXIS-Y Dark Spot Serum @1249tk". It is free,
 * high-visibility promo space in a component every site already has.
 *
 * Built from getDeals() rather than a CMS field, so it maintains itself: the
 * deepest discounts of the day appear without anyone editing copy.
 *
 * The rotation is motion, so it respects prefers-reduced-motion by not running
 * at all, and it stops the moment the customer starts typing.
 */
async function startPlaceholderRotation(input) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let deals;
  try {
    deals = await getDeals(4);
  } catch {
    return;                       // keep the static placeholder
  }
  if (!deals || deals.length < 2) return;

  const original = input.getAttribute('placeholder');
  const phrases = deals.map((d) => {
    const pct = Math.round((d.originalPrice - d.price) / d.originalPrice * 100);
    return `${d.title.split('—')[0].trim()} · ${pct}% off`;
  });

  let i = 0;
  let timer = null;

  const swap = () => {
    // Fade via a class rather than writing styles inline: the transition lives
    // in CSS, the timing lives here (context.md §2).
    input.classList.add('is-swapping');
    setTimeout(() => {
      input.setAttribute('placeholder', phrases[i % phrases.length]);
      i += 1;
      input.classList.remove('is-swapping');
    }, 260);
  };

  const stop = () => {
    clearInterval(timer);
    timer = null;
    input.classList.remove('is-swapping');
    if (original) input.setAttribute('placeholder', original);
  };

  timer = setInterval(swap, 4200);
  swap();

  // Once someone engages with the box, stop distracting them.
  input.addEventListener('focus', stop, { once: true });
  input.addEventListener('input', stop, { once: true });
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
