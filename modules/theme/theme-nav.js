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
  href: '/admin/appearance',
  area: 'content',
  group: 'Settings',
  order: 80,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2.2-.9 2.2-2 0-1.2-1-1.8-1-2.8 0-.8.7-1.4 1.6-1.4H17a4.5 4.5 0 0 0 4.5-4.5C21.5 6.2 17.3 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="11" cy="7" r="1.2"/><circle cx="15.5" cy="8.5" r="1.2"/></svg>',
});

/*
 * Kept apart from Appearance rather than folded into it. They answer different
 * questions — what the shop is WEARING against how its home page is ARRANGED —
 * and the Appearance screen is one radio group with a paragraph of consequence
 * beside it. A fourteen-dropdown table grafted underneath would bury the theme
 * picker in the screen named after it.
 *
 * Order 81: immediately after Appearance, which is where somebody looking for
 * it will already be standing.
 */
registerScreen({
  id: 'home-layout',
  label: 'Home layout',
  href: '/admin/layout',
  area: 'content',
  group: 'Settings',
  order: 81,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="5" rx="1.2"/><rect x="3" y="12" width="7" height="8" rx="1.2"/><rect x="13" y="12" width="8" height="3.4" rx="1.2"/><path d="M13 18.6h8"/></svg>',
});
