/**
 * courier-nav.js — this module's entry in the admin sidebar.
 *
 * Loaded on every admin page (see ADMIN_NAV in tools/assemble.py) so the nav is
 * identical everywhere. Separate from the page logic for exactly that reason:
 * registration must not depend on which screen you happen to be looking at.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'couriers',
  label: 'Couriers',
  href: '/admin/couriers',
  // Whoever may work an order may see who carries it. Matches the
  // `admin:orders` guard on this module's routes.
  area: 'orders',
  group: 'Trade',
  order: 20,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
});
