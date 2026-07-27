/**
 * bundle/backend/api.js — the frontend seam for product pairings.
 *
 * Swap the fetch inside `getBundleFor()` for the real endpoint and nothing in
 * bundle.js changes. The response shape is the contract; see endpoints.md.
 *
 * WHY THE BROWSER NEVER COMPUTES THIS
 * -----------------------------------
 * "Frequently bought together" is an aggregate over other people's orders. To
 * compute it here, the browser would need the order table — every customer's
 * basket, shipped to every visitor. The aggregate is cheap; the data behind it
 * is not ours to hand out. So co-purchase counting lives in BundleService, on
 * the server, and this file only ever asks for the answer.
 *
 * Until there are orders to count, the answer is a merchant-curated pairing and
 * says so. `source` carries which one you got, and bundle.js words the heading
 * from it — "Frequently bought together" is a claim about real customers, and
 * it is not printed until real customers have made it true.
 */

import { getProductById } from '../../catalog/backend/api.js';

const DATA_URL = new URL('../data/bundles.json', import.meta.url);

let cache = null;

async function loadBundles() {
  if (!cache) {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`bundles.json ${res.status}`);
    cache = await res.json();
  }
  return cache;
}

/**
 * The pairing to show on a product page.
 *
 * @param {string} productId the product being viewed — it anchors the bundle
 * @returns {Promise<null|{
 *   id: string, title: string, reason: string, source: 'curated'|'behavioural',
 *   anchor: object, companions: object[]
 * }>} null when the product belongs to no bundle, or every companion is out of
 *   stock. Offering a pairing you cannot deliver is worse than offering none.
 */
export async function getBundleFor(productId) {
  // TODO: backend — GET /api/bundles/{productId}
  const { bundles } = await loadBundles();

  // First match wins. A product can sit in several bundles (walnuts belong on
  // the cheese board and in the nut jar); the file order is the merchant's
  // priority, so it is not sorted or shuffled here.
  const bundle = bundles.find((b) => b.members.includes(productId));
  if (!bundle) return null;

  const anchor = await getProductById(productId);
  if (!anchor) return null;

  const companions = (
    await Promise.all(
      bundle.members.filter((id) => id !== productId).map((id) => getProductById(id)),
    )
  ).filter((p) => p && p.inStock);

  if (!companions.length) return null;

  return {
    id: bundle.id,
    title: bundle.title,
    reason: bundle.reason,
    // The static build has no order history to count, so this is always
    // 'curated' here. The server returns 'behavioural' once it has enough.
    source: 'curated',
    anchor,
    companions,
  };
}
