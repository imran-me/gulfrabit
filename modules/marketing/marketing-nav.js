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

/**
 * The three Meta keys, under Settings rather than beside Tracking.
 *
 * It holds a secret (the Conversions API token) and saving it rewrites every
 * storefront page, so it belongs with the screens that change the whole shop
 * and are owners' by default — the `settings` area, which the routes behind it
 * require as well. It is opened once at setup and again when something looks
 * wrong, not in the daily breath Trade is for.
 */
registerScreen({
  id: 'pixel',
  label: 'Pixel setup',
  href: '/admin/pixel',
  area: 'settings',
  group: 'Settings',
  order: 85,
  // A pixel sending outward: the square is what sits in every page, the arcs
  // are what it tells Meta.
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="8.5" width="7" height="7" rx="1.4"/><path d="M14 8.8a4.5 4.5 0 0 1 0 6.4"/><path d="M17.2 5.8a8.7 8.7 0 0 1 0 12.4"/></svg>',
});
