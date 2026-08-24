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

/**
 * The customer's orders — the real ones when there is a server to ask.
 *
 * THE SEAM MATTERS MORE THAN IT USED TO. This returned a fixture plus whatever
 * was in localStorage, which was fine while the page only listed things. It
 * stopped being fine when "Review this" appeared on a delivered line: the
 * review endpoint checks the real orders table, so a link built from a fixture
 * order sends a customer to be told they never bought the thing they are
 * looking at a receipt for.
 *
 * So the server answers first. It falls back to the old behaviour ONLY when
 * there is no backend at all — a 404 or a network failure, which is what a
 * static deployment of these files looks like. A 401 is not that: it is the
 * real server saying "not signed in", and answering it with a fixture would
 * show one visitor another person's order history. Same rule, and the same
 * reason, as the guard at the top of modules/admin/backend/api.js.
 */
/**
 * The customer's order history, as a result rather than a bare array.
 *
 *   { ok: true,  orders }              the list, however long — including zero
 *   { ok: false, reason: 'auth' }      401/403: signed out, not empty
 *   { ok: false, reason: 'error' }     500 and friends: broken, not empty
 *
 * It used to return [] for all three. The page reads an empty array as "No
 * orders yet — when you place an order it will appear here", so a 500 during
 * an outage told every customer their purchase history was empty and invited
 * them to buy it all again. A 401 did the same thing silently, and this
 * storefront has no real sign-in yet, so on the live site that was not the
 * outage case — it was every visitor, every time, permanently, on top of a
 * localStorage history that checkout had genuinely written.
 */
export async function getOrders() {
  try {
    const res = await fetch('/api/account/orders', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });

    if (res.ok) return { ok: true, orders: (await res.json()).data ?? [] };

    // Anything the server actually answered is the server's answer and stands.
    // Only "there is nothing here" falls through to the local history.
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth' };
    if (res.status !== 404) return { ok: false, reason: 'error' };
  } catch {
    // TypeError from fetch: no server, or no network. Fall through.
  }

  const local = storage.get(KEYS.ORDERS, []);
  const mock = await getMockOrders().catch(() => []);
  const seen = new Set();

  return {
    ok: true,
    orders: [...local, ...mock].filter((o) => (seen.has(o.id) ? false : seen.add(o.id))),
  };
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
