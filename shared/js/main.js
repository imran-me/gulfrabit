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
import { initFooterSocial } from './components/footer-social.js';
import { initAnalytics } from './core/analytics.js';
import { initCouponLink } from './core/coupon-link.js';
import { initMobileTabbar } from './components/mobile-tabbar.js';
import { initWhatsAppBubble } from './components/whatsapp-bubble.js';
import { initSupportLine } from './components/support-line.js';

/**
 * Each init is isolated.
 *
 * They used to run as a bare sequence, so the first one to throw took every
 * one after it with it — and because [data-reveal] starts at opacity 0, a
 * failure anywhere before initScrollReveal left whole sections of the shop
 * invisible rather than merely unanimated. One broken component should cost
 * its own feature and nothing else.
 */
function boot() {
  const steps = [
    // First, before anything can navigate: it reads the UTMs off the landing
    // URL and they are only there on the first page of a visit.
    ['analytics', initAnalytics],
    // Also first-thing: the coupon rides the landing URL, same as the UTMs.
    ['coupon-link', initCouponLink],
    ['header', initHeader],
    // After initHeader: it wires the mega-menu and drawer behaviour to the
    // container elements, which this only refills.
    ['category-menu', initCategoryMenu],
    // Early: it must be watching before the product grids paint.
    ['image-settle', initImageSettle],
    ['cart-drawer', initCartDrawer],
    ['scroll-reveal', initScrollReveal],
    ['search', initSearchAutocomplete],
    ['newsletter', initNewsletter],
    ['wishlist', initWishlistButtons],
    ['quantity-steppers', initQuantitySteppers],
    ['footer-social', initFooterSocial],
    ['product-cards', enhanceProductCards],
    ['tabbar', initMobileTabbar],
    ['whatsapp', initWhatsAppBubble],
    ['support-line', initSupportLine],
  ];

  for (const [name, fn] of steps) {
    try {
      fn();
    } catch (err) {
      console.error(`[boot] ${name} failed`, err);
    }
  }

  document.documentElement.classList.add('js-ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
