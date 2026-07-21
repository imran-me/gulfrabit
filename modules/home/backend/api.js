/**
 * Home · module API
 *
 * Today: composes collections from the shared data-service (mock JSON).
 * Later: replace the body with a single GET /home/collections call — the page
 * (home.js) keeps calling getHomeCollections() unchanged.
 */

import { getFeatured } from '../../../shared/js/core/data-service.js';

export async function getHomeCollections() {
  // TODO: backend — swap for fetch(`${API_BASE}/home/collections`).
  const [premium, bestsellers, newArrivals] = await Promise.all([
    getFeatured('premium', 8),
    getFeatured('bestseller', 8),
    getFeatured('new', 8),
  ]);
  return { premium, bestsellers, newArrivals };
}
