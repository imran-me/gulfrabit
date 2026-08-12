/**
 * highlights-nav.js — this module's entry in the admin sidebar.
 * Loaded on every admin page so the nav is identical everywhere.
 *
 * First in the Catalogue group. It is the screen that decides what a customer
 * sees before anything else, so it reads oddly buried under the things it
 * chooses from.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'highlights',
  label: 'Home page',
  href: '/admin/home',
  area: 'products',
  group: 'Catalogue',
  order: 32,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l2.6 5.6 6.4.8-4.7 4.3 1.3 6.3L12 17l-5.6 3 1.3-6.3L3 9.4l6.4-.8z"/></svg>',
});
