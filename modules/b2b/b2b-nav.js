/**
 * b2b-nav.js — the quote inbox's entry in the admin sidebar.
 * Loaded on every admin page so the nav is identical everywhere.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'quotes',
  label: 'Quote requests',
  href: '/admin/quotes',
  // Whoever works orders works quote requests — the same job at a different
  // size, and the same capability guarding the routes.
  area: 'orders',
  group: 'Trade',
  order: 15,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16v12H7l-3 3z"/><path d="M8 9h8M8 12h5"/></svg>',
});
