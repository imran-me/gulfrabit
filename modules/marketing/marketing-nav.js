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
  href: '/admin/campaigns',
  area: 'orders',
  group: 'Trade',
  order: 20,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l14-6v14L3 13v-2z"/><path d="M7 13.5V19a1.5 1.5 0 0 0 3 0v-4"/><path d="M17 8.5c2 .4 3.5 1.7 3.5 3.5s-1.5 3.1-3.5 3.5"/></svg>',
});

/**
 * Directly above Campaigns, and in the same group.
 *
 * The two answer halves of one question and are read together: Tracking says
 * where people went and where they left, Campaigns says which ad paid for it.
 * Order 19 rather than 21 because the visitor's side comes first — you look at
 * who arrived before you look at what it cost.
 */
registerScreen({
  id: 'tracking',
  label: 'Tracking',
  href: '/admin/tracking',
  area: 'orders',
  group: 'Trade',
  order: 19,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><path d="M7 15l3-4 3 2 4-6"/><circle cx="17" cy="7" r="1.4"/></svg>',
});
