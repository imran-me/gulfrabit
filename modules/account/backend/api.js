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
