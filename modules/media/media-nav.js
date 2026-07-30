/**
 * media-nav.js — this module's entry in the admin sidebar.
 * Loaded on every admin page so the nav is identical everywhere.
 *
 * Grouped under Catalogue and ordered after Categories: images are something
 * you manage while working on the catalogue, and the library is the place you
 * go to tidy up or delete, not the place you go to add one — adding happens in
 * the picker, from wherever you already are.
 */

import { registerScreen } from '../admin/admin-shell.js';

registerScreen({
  id: 'media',
  label: 'Images',
  href: '/modules/media/library.html',
  area: 'products',
  group: 'Catalogue',
  order: 36,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-5-5-6 6-3-3-4 4"/></svg>',
});
