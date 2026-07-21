/**
 * Account · module API (mock)
 * Reads/writes localStorage today. Replace each with the /account endpoints;
 * the pages keep calling these names.
 */
import { storage, KEYS } from '../../../shared/js/core/storage.js';
import { getMockOrders } from '../../../shared/js/core/data-service.js';

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
