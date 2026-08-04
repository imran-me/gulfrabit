/**
 * marketing-nav.js — this module's entry in the admin sidebar.
 * Loaded on every admin page so the nav is identical everywhere.
 *
 * In Trade between Orders and Customers: the question this screen answers —
 * "which ad is selling?" — is asked in the same breath as "what sold today?",
 * not while curating the catalogue.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'campaigns',
  label: 'Campaigns',
  href: '/modules/marketing/campaigns.html',
  area: 'orders',
  group: 'Trade',
  order: 20,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l14-6v14L3 13v-2z"/><path d="M7 13.5V19a1.5 1.5 0 0 0 3 0v-4"/><path d="M17 8.5c2 .4 3.5 1.7 3.5 3.5s-1.5 3.1-3.5 3.5"/></svg>',
});
