/**
 * image-settle.js — images arrive instead of appearing.
 *
 * Every product image is `loading="lazy"`, so on a scrolling grid they snap
 * into place one at a time as they decode. That flicker is the single most
 * "cheap" thing about an image-heavy page — it is what separates a catalogue
 * that feels considered from one that feels like it is still loading, and no
 * amount of typography compensates for it.
 *
 * Each image fades up from a fractionally larger scale as it becomes ready, so
 * it settles rather than pops.
 *
 * SAFE WITHOUT JAVASCRIPT, and that is why the class is added here rather than
 * written into the markup. The CSS only hides `img.settle:not(.is-settled)` —
 * an element this script has explicitly opted in. If the script never runs, no
 * image is ever hidden. Writing `class="settle"` into the HTML instead would
 * mean a JS failure left every photo on the site invisible, which is a far
 * worse outcome than a flicker.
 */

export function initImageSettle() {
  if (!window.matchMedia) return;

  // Nothing to soften if the user has asked for less motion, and a fade is
  // still motion.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const settle = (img) => {
    img.classList.add('is-settled');
  };

  const watch = (img) => {
    if (img.dataset.settleWatched) return;
    img.dataset.settleWatched = '1';

    // Already decoded — served from cache, or above the fold and finished
    // before this ran. Marking it opted-in and settled in the same frame means
    // it never flashes.
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('settle', 'is-settled');
      return;
    }

    img.classList.add('settle');

    // `error` as well as `load`: a broken image left holding opacity 0 is an
    // invisible gap rather than the browser's own broken-image affordance,
    // and the merchant would never find out a photo was missing.
    img.addEventListener('load', () => settle(img), { once: true });
    img.addEventListener('error', () => settle(img), { once: true });
  };

  const scan = (root = document) => {
    root.querySelectorAll?.('img[loading="lazy"]').forEach(watch);
  };

  scan();

  // Product grids, search results and the cart are all painted after this
  // runs. Rather than asking every one of them to call back, watch the
  // document for images that appear later.
  if ('MutationObserver' in window) {
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'IMG') watch(node);
          else scan(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
}
