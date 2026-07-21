/**
 * router-helpers — read/write URL query params without a router library.
 * PLP/PDP/search pages read their identity from the query string, e.g.
 *   modules/catalog/category.html?slug=nuts-dry-fruits&sort=price-asc
 *   modules/catalog/product.html?id=gr-1042
 *   modules/catalog/search-results.html?q=medjool%20dates
 */

/** Get a single query param, with an optional fallback. */
export function getParam(name, fallback = null) {
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

/** Get all params as a plain object. */
export function getParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

/**
 * Update params in the URL without reloading the page (history.replaceState).
 * Pass null/'' to remove a key. Used by filters/sort so state is shareable.
 */
export function setParams(updates, { replace = true } = {}) {
  const params = new URLSearchParams(window.location.search);
  Object.entries(updates).forEach(([k, v]) => {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) params.delete(k);
    else params.set(k, Array.isArray(v) ? v.join(',') : String(v));
  });
  const qs = params.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}

/** Absolute path to the site root, so links work from any page depth. */
export function root(path = '') {
  return `${window.location.origin}/${path.replace(/^\//, '')}`;
}
