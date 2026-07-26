/**
 * Home · module API
 *
 * Today: composes collections from the catalog module (mock JSON).
 * Later: replace the body with a single GET /home/collections call — the page
 * (home.js) keeps calling getHomeCollections() unchanged.
 */

import { getFeatured } from '../../catalog/backend/api.js';

export async function getHomeCollections() {
  // TODO: backend — swap for fetch(`${API_BASE}/home/collections`).
  const [premium, bestsellers, newArrivals] = await Promise.all([
    getFeatured('premium', 8),
    getFeatured('bestseller', 8),
    getFeatured('new', 8),
  ]);
  return { premium, bestsellers, newArrivals };
}
