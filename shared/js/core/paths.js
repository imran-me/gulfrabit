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

/**
 * Where a product lives: /product/ajwa-dates-madinah-select
 *
 * THE FALLBACK IS THE SAFETY PROPERTY. A product with no slug — mock data, a
 * cart line that only ever stored a SKU, a row written before slugs existed —
 * yields /product/gr-1101, and that resolves too, because the page accepts a
 * slug or a SKU. There is no input to this function that produces a dead link
 * for a product that exists.
 *
 * Accepts a product object or a bare key, since half the callers hold a full
 * product and the other half hold a cart line.
 */
export function productURL(product) {
  const key = typeof product === 'string'
    ? product
    : (product?.slug || product?.id || '');
  return siteURL(`product/${encodeURIComponent(key)}`);
}

/** Where a category lives: /category/dates-nuts */
export function categoryURL(slug) {
  return siteURL(`category/${encodeURIComponent(slug || '')}`);
}

/*
 * A NOTE ON WHERE THESE WORK
 * --------------------------
 * Both forms depend on the .htaccess rewrites, so they need a host that reads
 * .htaccess — Apache, which is what gulfrabit.com runs. A pure static host
 * (GitHub Pages) has no rewrite layer and would 404 on them; Pages is not
 * enabled for this repo, and if it ever is, the link builders are the one
 * place to change rather than 149 call sites.
 */
