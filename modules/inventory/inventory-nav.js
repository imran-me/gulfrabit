/**
 * inventory-nav.js — this module's entries in the admin sidebar.
 * Loaded on every admin page so the nav is identical everywhere.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'stock',
  label: 'Stock',
  href: '/modules/inventory/stock.html',
  match: ['/modules/inventory/movements.html'],
  // owner, manager and warehouse. Moving stock is the warehouse role's job.
  area: 'inventory',
  group: 'Warehouse',
  order: 40,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-5 9 5v10l-9 5-9-5z"/><path d="M3 9l9 5 9-5M12 14v10"/></svg>',
});
