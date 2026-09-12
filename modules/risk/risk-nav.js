/**
 * risk-nav.js — this module's entry in the admin sidebar.
 * Loaded on every admin page so the nav is identical everywhere.
 *
 * In Trade, directly after Couriers: the question it answers — "is this parcel
 * worth sending?" — is asked in the same minute as "which courier gets it",
 * and by the same person.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'risk',
  label: 'Delivery risk',
  href: '/admin/risk',
  area: 'orders',
  group: 'Trade',
  order: 26,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2 4.6 6v5.4c0 4.3 3 8.2 7.4 9.4 4.4-1.2 7.4-5.1 7.4-9.4V6z"/><path d="M12 9v3.6M12 15.8h.01"/></svg>',
});
