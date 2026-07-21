/**
 * compare-tray — a floating bar (bottom) listing the current compare selection
 * with thumbnails, quick-remove, a "Compare" CTA and clear. Self-contained;
 * shown only when there is a selection. Boots on every page via main.js.
 */
import * as store from '../core/state.js';
import { getAllProducts } from '../core/data-service.js';
import { siteURL } from '../core/paths.js';

let bar = null;
let productIndex = null; // id -> product (lazy)

async function index() {
  if (!productIndex) {
    const all = await getAllProducts().catch(() => []);
    productIndex = new Map(all.map((p) => [p.id, p]));
  }
  return productIndex;
}

function build() {
  if (bar) return;
  bar = document.createElement('div');
  bar.className = 'compare-tray';
  bar.hidden = true;
  document.body.appendChild(bar);
  store.subscribe(store.EVENTS.COMPARE, render);
  render();
}

async function render() {
  if (!bar) return;
  const ids = store.getCompare();
  if (!ids.length) { bar.hidden = true; bar.innerHTML = ''; return; }
  const idx = await index();
  const items = ids.map((id) => idx.get(id)).filter(Boolean);

  bar.innerHTML = `
    <div class="compare-tray__inner">
      <div class="compare-tray__items">
        ${items.map((p) => `
          <div class="compare-tray__item">
            <img src="${p.image}" alt="${escapeAttr(p.title)}">
            <button class="compare-tray__remove" data-remove="${p.id}" aria-label="Remove ${escapeAttr(p.title)} from compare">✕</button>
          </div>`).join('')}
        ${Array.from({ length: Math.max(0, store.COMPARE_MAX - items.length) }, () => '<div class="compare-tray__slot" aria-hidden="true"></div>').join('')}
      </div>
      <div class="compare-tray__actions">
        <button class="btn-gr btn-ghost-gr btn-sm-gr" data-clear>Clear</button>
        <a class="btn-gr btn-primary-gr" href="${siteURL('modules/catalog/compare.html')}">Compare (${items.length})</a>
      </div>
    </div>`;
  bar.hidden = false;

  bar.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => store.removeFromCompare(b.dataset.remove)));
  bar.querySelector('[data-clear]')?.addEventListener('click', () => store.clearCompare());
}

export function initCompareTray() { build(); }

function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
