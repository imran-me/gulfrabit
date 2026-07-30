/**
 * main.js — shared entry point loaded by EVERY page.
 *
 * Boots the common chrome (header, cart drawer, toasts, scroll reveal, search
 * autocomplete, newsletter, wishlist buttons, quantity steppers). Page-specific
 * logic lives in modules/<feature>/<feature>.js and is imported by that page's
 * own bootstrap snippet — NOT here — so each page only ships what it needs.
 *
 * Load per page as:
 *   <script type="module" src="/shared/js/main.js"></script>
 *   <script type="module" src="/modules/<feature>/<feature>.js"></script>
 */

import { initHeader } from './components/header-nav.js';
import { initCategoryMenu } from './components/category-menu.js';
import { initImageSettle } from './components/image-settle.js';
import { initCartDrawer } from './components/cart-drawer.js';
import { initScrollReveal } from './components/scroll-reveal.js';
import { initSearchAutocomplete } from './components/search-autocomplete.js';
import { initNewsletter } from './components/newsletter-signup.js';
import { initWishlistButtons } from './components/wishlist.js';
import { initQuantitySteppers } from './components/quantity-stepper.js';
import { enhanceProductCards } from './components/product-card.js';
import { initCompareTray } from './components/compare-tray.js';

function boot() {
  initHeader();
  // After initHeader: it wires the mega-menu and drawer behaviour to the
  // container elements, which this only refills. Swapping the contents does
  // not disturb those listeners.
  initCategoryMenu();
  // Early: it must be watching before the product grids paint, or the first
  // screenful of images is already decoded by the time it looks.
  initImageSettle();
  initCartDrawer();
  initScrollReveal();
  initSearchAutocomplete();
  initNewsletter();
  initWishlistButtons();
  initQuantitySteppers();
  initCompareTray();
  enhanceProductCards();          // wire any HTML-authored product cards
  document.documentElement.classList.add('js-ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
