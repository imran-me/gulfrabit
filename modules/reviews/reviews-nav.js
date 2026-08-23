/**
 * reviews-nav.js — this module's entry in the admin sidebar.
 * Loaded on every admin page so the nav is identical everywhere.
 *
 * Under Catalogue, after Images: what customers say about a product is part of
 * the product, and the person who curates one is the person who reads the
 * other. Same `products` capability the routes are gated on.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'reviews',
  label: 'Reviews',
  href: '/admin/reviews',
  area: 'products',
  group: 'Catalogue',
  order: 38,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4l2.3 4.7 5.2.8-3.7 3.6.9 5.1-4.7-2.4-4.7 2.4.9-5.1L4.5 9.5l5.2-.8z"/></svg>',
});
