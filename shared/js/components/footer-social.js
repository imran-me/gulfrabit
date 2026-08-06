/**
 * footer-social.js — show a social icon only when there is somewhere to go.
 *
 * The footer ships all three icons hidden. Each is revealed only if
 * CONFIG.social names a URL for it, so an unconfigured shop shows no icon
 * rather than three links to "#". Nothing here runs on a page without a
 * footer, and a missing config value is the normal case, not an error.
 */

import { CONFIG } from '../core/site-config.js';

export function initFooterSocial() {
  const links = document.querySelectorAll('[data-social]');
  if (!links.length) return;

  for (const a of links) {
    const url = CONFIG.social?.[a.dataset.social];
    if (!url) continue;                       // stays hidden

    a.href = url;
    a.target = '_blank';
    // noopener because target=_blank otherwise hands the new tab a live
    // reference back to this window; noreferrer keeps the referrer off it.
    a.rel = 'noopener noreferrer';
    a.hidden = false;
  }
}
