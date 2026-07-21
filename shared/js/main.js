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
