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

import { suggest } from '../core/data-service.js';
import { siteURL } from '../core/paths.js';
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
          <a class="search-suggest__item" href="${siteURL(`modules/catalog/product.html?id=${encodeURIComponent(it.id)}`)}">
            <img src="${it.image}" alt="" width="40" height="40" loading="lazy">
            <span><span class="search-suggest__title">${escapeHtml(it.title)}</span>
            <span class="caption">${escapeHtml(it.brand || '')}</span></span>
          </a>`).join('');
      }
      panel.hidden = false;
    } catch { panel.hidden = true; }
  }, 220);

  input.addEventListener('input', run);
  input.addEventListener('focus', () => { if (panel.innerHTML) panel.hidden = false; });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) panel.hidden = true; });

  form.addEventListener('submit', (e) => {
    const q = input.value.trim();
    if (!q) { e.preventDefault(); return; }
    // Let the form navigate to search-results.html?q=... (default GET behaviour).
  });
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
