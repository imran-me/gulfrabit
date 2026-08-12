/**
 * accounting-nav.js — this module's entries in the admin sidebar.
 * Loaded on every admin page so the nav is identical everywhere.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'pnl',
  label: 'Profit & loss',
  href: '/admin/pnl',
  // owner, manager, accounts. Warehouse never sees the books.
  area: 'accounting',
  group: 'Books',
  order: 50,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
});

registerScreen({
  id: 'journal',
  label: 'Journal',
  href: '/admin/journal',
  area: 'accounting',
  group: 'Books',
  order: 51,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3h14v18H5z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>',
});
