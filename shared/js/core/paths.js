/**
 * paths — resolve URLs against the SITE ROOT so the same build works whether it
 * is served from a domain root (https://gulfrabit.com/) OR a project subpath
 * (https://user.github.io/gulfrabit/).
 *
 * The base is derived from THIS module's own URL via import.meta.url — no
 * `location.origin` assumptions and no hard-coded repo name. This file lives at
 * shared/js/core/paths.js, so three levels up is the site root.
 *
 * Usage:  import { siteURL } from '.../core/paths.js';
 *         a.href = siteURL('modules/catalog/product.html?id=gr-1');
 *         location.href = siteURL('index.html');
 */

// shared/js/core/ -> shared/js/ -> shared/ -> <site root>/
export const SITE_BASE = new URL('../../../', import.meta.url);

/** Absolute URL for a site-root-relative path (leading slash optional). */
export function siteURL(path = '') {
  return new URL(String(path).replace(/^\/+/, ''), SITE_BASE).href;
}
