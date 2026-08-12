/**
 * router-helpers — read/write URL query params without a router library.
 * PLP/PDP/search pages read their identity from the query string, e.g.
 *   modules/catalog/category.html?slug=nuts-makhana&sort=price-asc
 *   modules/catalog/product.html?id=gr-1101
 *   modules/catalog/search-results.html?q=medjool%20dates
 */

/** Get a single query param, with an optional fallback. */
export function getParam(name, fallback = null) {
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

/**
 * The key carried by a readable URL's PATH — `/product/ajwa-dates` → 'ajwa-dates'.
 *
 * WHY THIS EXISTS, AND WHY getParam ALONE WAS NOT ENOUGH
 * -----------------------------------------------------
 * Apache rewrites /product/<slug> onto modules/catalog/product.html?id=<slug>.
 * That rewrite is INTERNAL: the server sees the query string, the browser
 * never does. `window.location.search` is empty on a rewritten URL, so a page
 * that reads only getParam() gets null and renders "not found" — which is
 * exactly what the live site did the first time these URLs were tried.
 *
 * So the query string is the first source (every old link, and every filter
 * the page itself writes with setParams, still carries one) and the path is
 * the fallback. Both work, neither is required.
 *
 * @param {string} prefix the segment before the key — 'product', 'category'
 * @returns {string|null}
 */
export function pathKey(prefix) {
  const match = window.location.pathname.match(
    new RegExp(`/${prefix}/([^/?#]+)/?$`),
  );
  // decode, because a slug could legitimately arrive percent-encoded and the
  // lookup compares against the plain string.
  try {
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return match ? match[1] : null;   // malformed escape — use it verbatim
  }
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

/**
 * Declare this page's one true URL, keeping only the params that identify it.
 *
 * WHY A PAGE HAS TO DO THIS AT RUNTIME
 * ------------------------------------
 * Pages whose identity is a query param are one file on disk, so the build
 * cannot write a canonical for them — `/modules/catalog/product.html` with no
 * id would tell a search engine that every product in the shop is the same
 * page, and that the real one is the empty shell. tools/assemble.py leaves
 * these pages without the tag on purpose (see DYNAMIC_CANONICAL there).
 *
 * WHAT IT IS ACTUALLY FOR
 * -----------------------
 * This shop advertises. Every ad link arrives as
 * `product.html?id=gr-1101&utm_source=facebook&utm_campaign=dates-aug`, and to
 * a crawler each campaign is a different URL showing identical content. One
 * product's ranking then splits across a dozen copies of itself, and the copy
 * that surfaces is the one with a tracking string in it.
 *
 * So: keep the identifying params, drop everything else.
 *
 *   setCanonical(['id'])      -> /modules/catalog/product.html?id=gr-1101
 *   setCanonical([])          -> /modules/catalog/search-results.html
 *
 * Sorting and filter params are deliberately NOT kept. "Nuts, price low to
 * high" is the same shelf as "nuts" and should not compete with it.
 *
 * @param {string[]} keep  params that genuinely change what the page IS
 */
export function setCanonical(keep = []) {
  try {
    const current = new URLSearchParams(window.location.search);
    const kept = new URLSearchParams();

    // In the order given, not the order they arrived, so two links to the same
    // page with the params swapped produce one canonical rather than two.
    keep.forEach((k) => {
      const v = current.get(k);
      if (v) kept.set(k, v);
    });

    const qs = kept.toString();
    const href = `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ''}`;

    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;
  } catch {
    // A missing canonical costs a little ranking; a thrown error costs the
    // page. This is never the reason a product fails to render.
  }
}

/**
 * Rewrite the title and description a search result or a shared link will use.
 *
 * Every product in this shop is served from one file, so the HTML that leaves
 * the server says `<title>Product — GulfRabit</title>` and carries the same
 * generic description twenty times over. Google renders JavaScript, so it does
 * eventually see the real product — but the served title is what most often
 * becomes the snippet, and forty pages competing under one identical title is
 * the single biggest thing holding this catalogue back.
 *
 * This is the runtime half of that fix. The real one is a URL per product,
 * where the title is in the file before anyone asks for it.
 *
 * Open Graph and Twitter tags are updated alongside, because they are what a
 * WhatsApp or Messenger preview reads — and in this market a shared product
 * link is a sales channel, not a footnote.
 *
 * @param {{title?: string, description?: string}} meta
 */
export function setPageMeta({ title, description } = {}) {
  try {
    if (title) {
      document.title = title;
      setTag('property', 'og:title', title);
      setTag('name', 'twitter:title', title);
    }
    if (description) {
      // Search engines truncate around 160 characters; sending more is not
      // wrong, it is just never read.
      const text = description.length > 160 ? `${description.slice(0, 157).trimEnd()}…` : description;
      setTag('name', 'description', text);
      setTag('property', 'og:description', text);
      setTag('name', 'twitter:description', text);
    }
  } catch {
    // Never the reason a page fails to render.
  }
}

function setTag(attr, key, content) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

/** Absolute URL to a site-root-relative path (portable across root/subpath). */
export { siteURL as root } from './paths.js';
