/**
 * admin-nav.js — admin's own screens, registered into the sidebar.
 *
 * WHY THIS IS SEPARATE FROM THE PAGE SCRIPTS
 * ------------------------------------------
 * Registration used to live inside dashboard-page.js and orders-page.js, which
 * meant the sidebar was built from whatever scripts happened to be on the page
 * you were looking at: the Orders screen showed no Dashboard link, and the
 * Dashboard showed no Orders link. A navigation that changes depending on where
 * you are standing is worse than no navigation.
 *
 * So registration is its own file, loaded on EVERY admin page, while page logic
 * loads only on its own page. Each module that contributes screens ships one of
 * these and adds it to ADMIN_NAV in tools/assemble.py — one line in, one line
 * out, and the sidebar is identical everywhere.
 */

import { registerScreen } from './admin-shell.js';

registerScreen({
  id: 'dashboard',
  label: 'Dashboard',
  href: '/modules/admin/index.html',
  // Every role has 'dashboard' (AdminUser::CAPABILITIES). The controller still
  // decides which cards each role receives.
  area: 'dashboard',
  group: 'Overview',
  order: 0,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
});

registerScreen({
  id: 'orders',
  label: 'Orders',
  href: '/modules/admin/orders.html',
  // Viewing one order is still being in Orders.
  match: ['/modules/admin/order.html'],
  area: 'orders',
  group: 'Trade',
  order: 10,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 12h7M9 16h7"/></svg>',
});

registerScreen({
  id: 'customers',
  label: 'Customers',
  href: '/modules/admin/customers.html',
  match: ['/modules/admin/customer.html'],
  // Only owner and manager hold this capability. Warehouse sees a delivery
  // address on a packing slip; accounts sees money without names.
  area: 'customers',
  group: 'Trade',
  order: 30,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 20a6.4 6.4 0 0 0-2.2-4.8"/></svg>',
});
