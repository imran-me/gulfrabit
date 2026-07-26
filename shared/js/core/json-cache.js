/**
 * json-cache — fetch a JSON file once per page load, and hand every later
 * caller the same promise.
 *
 * This is a genuine cross-cutting primitive: it knows nothing about products,
 * orders or users. Each module points it at the dataset **it owns** —
 * catalog at modules/catalog/data/, account at modules/account/data/, and so
 * on — so no shared file has to know what data exists in the app.
 *
 * It replaces the old shared/js/core/data-service.js, which had grown into a
 * global bucket serving four different modules' domains from one place. That
 * made "delete a module and its data goes with it" impossible.
 *
 *   import { loadJSON } from '../../../shared/js/core/json-cache.js';
 *   const { products } = await loadJSON(siteURL('modules/catalog/data/products.json'));
 */

const cache = new Map();

/**
 * @param {string} url absolute or resolved URL to a JSON file
 * @returns {Promise<any>} parsed JSON, memoised by URL
 */
export function loadJSON(url) {
  if (cache.has(url)) return cache.get(url);

  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
      return res.json();
    })
    .catch((err) => {
      // Drop the rejected promise so a transient failure can be retried
      // instead of being cached as a permanent error for the page's lifetime.
      cache.delete(url);
      throw err;
    });

  cache.set(url, promise);
  return promise;
}

/** Testing / hard-refresh escape hatch. */
export function clearJSONCache() {
  cache.clear();
}
