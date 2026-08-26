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
  href: '/admin',
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
  href: '/admin/orders',
  // Viewing one order is still being in Orders.
  match: ['/admin/order'],
  area: 'orders',
  group: 'Trade',
  order: 10,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 12h7M9 16h7"/></svg>',
});

registerScreen({
  id: 'customers',
  label: 'Customers',
  href: '/admin/customers',
  match: ['/admin/customer'],
  // Only owner and manager hold this capability. Warehouse sees a delivery
  // address on a packing slip; accounts sees money without names.
  area: 'customers',
  group: 'Trade',
  order: 30,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 20a6.4 6.4 0 0 0-2.2-4.8"/></svg>',
});

registerScreen({
  id: 'products',
  label: 'Products',
  href: '/admin/products',
  match: ['/admin/products/edit'],
  area: 'products',
  group: 'Catalogue',
  order: 35,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7 12 3 4 7v10l8 4 8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>',
});

registerScreen({
  id: 'coupons',
  label: 'Coupons & offers',
  href: '/admin/coupons',
  area: 'products',
  group: 'Catalogue',
  // After Images (36). Pricing follows the catalogue it prices.
  order: 38,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6z"/><path d="M9.5 9.5l5 5M9.5 9.5h.01M14.5 14.5h.01"/></svg>',
});

registerScreen({
  id: 'categories',
  label: 'Categories',
  href: '/admin/categories',
  area: 'products',
  group: 'Catalogue',
  order: 34,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
});

registerScreen({
  id: 'staff',
  label: 'Staff',
  href: '/admin/staff',
  // The only role holding `staff` is `owner`, so this entry simply does not
  // exist for anybody else's sidebar. That is courtesy, not security — the
  // routes behind it carry `admin:staff` and refuse on their own.
  area: 'staff',
  // Filed under Settings rather than Trade: it changes nothing about what is
  // sold, only who is allowed to sell it. After Appearance (80), because a
  // shop is dressed far more often than it is staffed.
  group: 'Settings',
  order: 85,
  // An ID badge, not the two figures Customers uses. Those are the people who
  // buy; these are the people who work here, and a sidebar where the two look
  // alike is a sidebar where somebody opens the wrong one.
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2.2"/><path d="M5.6 16.6a3.7 3.7 0 0 1 6.8 0"/><path d="M15 9.5h3.4M15 13h3.4"/></svg>',
});
