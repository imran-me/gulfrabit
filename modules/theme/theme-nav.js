/**
 * theme-nav.js — this module's entry in the admin sidebar.
 * Loaded on every admin page so the nav is identical everywhere.
 *
 * Filed under Settings rather than Catalogue: it changes nothing about what
 * is sold, only how the shop is dressed. `area: 'content'` puts it behind the
 * same capability as the CMS — the people who are trusted with the words on
 * the site are the people who should be trusted with its appearance, and
 * warehouse and accounts have no business here.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'appearance',
  label: 'Appearance',
  href: '/modules/theme/appearance.html',
  area: 'content',
  group: 'Settings',
  order: 80,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2.2-.9 2.2-2 0-1.2-1-1.8-1-2.8 0-.8.7-1.4 1.6-1.4H17a4.5 4.5 0 0 0 4.5-4.5C21.5 6.2 17.3 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="11" cy="7" r="1.2"/><circle cx="15.5" cy="8.5" r="1.2"/></svg>',
});
