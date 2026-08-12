/**
 * hero-nav.js — this module's entry in the admin sidebar.
 * Loaded on every admin page so the nav is identical everywhere.
 *
 * Directly above "Home page" (32). The banner is the first thing a customer
 * sees, so it reads oddly filed after the rails that sit beneath it.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'hero',
  label: 'Hero banners',
  href: '/modules/hero/hero.html',
  // `content` — arranging banners is merchandising, the same capability that
  // edits page copy. Deliberately not one that reaches money or customers.
  area: 'content',
  group: 'Catalogue',
  order: 31,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="19" height="12" rx="2"/><path d="M2.5 14l5-4 4 3 3.5-2.5 6.5 4.5"/><circle cx="8.5" cy="9" r="1.2"/><path d="M8 21h8"/></svg>',
});
