/**
 * Account · module API (mock)
 * Reads/writes localStorage today. Replace each with the /account endpoints;
 * the pages keep calling these names.
 */
import { storage, KEYS } from '../../../shared/js/core/storage.js';
import { loadJSON } from '../../../shared/js/core/json-cache.js';
import { siteURL } from '../../../shared/js/core/paths.js';

// Account owns its order history. Moved out of the global /data bucket
// 2026-07-26 so deleting this module takes its data with it.
const ORDERS_URL = siteURL('modules/account/data/orders.json');

/** Seeded order history, so a fresh visitor sees a populated account. */
export async function getMockOrders() {
  const { orders } = await loadJSON(ORDERS_URL);
  return orders;
}

export async function getOrders() {
  // TODO: backend — GET /orders. Today: local orders + mock history.
  const local = storage.get(KEYS.ORDERS, []);
  const mock = await getMockOrders().catch(() => []);
  const seen = new Set();
  return [...local, ...mock].filter((o) => (seen.has(o.id) ? false : seen.add(o.id)));
}

export async function getAddresses() { return storage.get(KEYS.ADDRESSES, []); }
export async function saveAddress(addr) {
  // TODO: backend — POST/PATCH /addresses.
  const list = storage.get(KEYS.ADDRESSES, []);
  const i = list.findIndex((a) => a.id === addr.id);
  if (i >= 0) list[i] = addr; else list.push(addr);
  storage.set(KEYS.ADDRESSES, list);
  return addr;
}
export async function deleteAddress(id) {
  storage.set(KEYS.ADDRESSES, storage.get(KEYS.ADDRESSES, []).filter((a) => a.id !== id));
  return true;
}

/**
 * Fold the saves made in this browser as a guest into the account just signed
 * into.
 *
 * WHY THIS EXISTS
 * ---------------
 * `wishlist_items` requires a user_id, so a guest has no server-side wishlist —
 * theirs is in localStorage. The cart already merged on sign-in; the wishlist
 * did not, so somebody who saved six things and then created an account landed
 * on an empty wishlist, with the items still in their browser, invisible, until
 * localStorage was cleared and they were gone for good. Quiet data loss at
 * exactly the moment a customer decides to trust the site with an account.
 *
 * Failure here is deliberately soft: a merge that does not go through must not
 * block a sign-in that already succeeded. The local list is untouched either
 * way, so the next sign-in tries again.
 *
 * @param {string[]} skus the guest's saved product ids
 * @returns {Promise<{ok:boolean, added:number, skipped:number, message:string|null}>}
 */
export async function mergeGuestWishlist(skus = []) {
  if (!skus.length) return { ok: true, added: 0, skipped: 0, message: null };

  try {
    const res = await fetch('/api/account/wishlist/merge', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ skus }),
    });

    if (!res.ok) return { ok: false, added: 0, skipped: 0, message: null };

    const { data, message } = await res.json();
    return { ok: true, added: data.added, skipped: data.skipped, message };
  } catch {
    // No backend yet, or offline. The saves stay in localStorage and the next
    // sign-in will try again — which is why nothing is cleared on success
    // either.
    return { ok: false, added: 0, skipped: 0, message: null };
  }
}
