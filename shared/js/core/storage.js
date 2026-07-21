/**
 * storage — safe wrapper around localStorage / sessionStorage.
 *
 * Every persisted key in the app goes through here so we have:
 *  - JSON (de)serialisation in one place,
 *  - graceful failure in private-mode / disabled-storage browsers,
 *  - a single namespaced prefix ("gr:") to avoid clashes.
 *
 * When the real backend arrives, cart/wishlist/session move server-side; only
 * the modules that read these keys change — this wrapper stays as a local cache.
 */

const PREFIX = 'gr:';

function makeStore(backing) {
  const available = (() => {
    try {
      const k = `${PREFIX}__test`;
      backing.setItem(k, '1');
      backing.removeItem(k);
      return true;
    } catch { return false; }
  })();

  // In-memory fallback so the app never crashes if storage is blocked.
  const memory = new Map();

  return {
    get(key, fallback = null) {
      const full = PREFIX + key;
      try {
        const raw = available ? backing.getItem(full) : memory.get(full);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      const full = PREFIX + key;
      const raw = JSON.stringify(value);
      try { available ? backing.setItem(full, raw) : memory.set(full, raw); }
      catch { memory.set(full, raw); }
    },
    remove(key) {
      const full = PREFIX + key;
      try { available ? backing.removeItem(full) : memory.delete(full); }
      catch { memory.delete(full); }
    },
  };
}

export const storage = makeStore(window.localStorage);
export const session = makeStore(window.sessionStorage);

/** Known storage keys — reference these, don't scatter string literals. */
export const KEYS = {
  CART: 'cart',
  WISHLIST: 'wishlist',
  COMPARE: 'compare',
  USER: 'user',
  ADDRESSES: 'addresses',
  ORDERS: 'orders',
  SAVED_FOR_LATER: 'saved-for-later',
  ANNOUNCE_DISMISSED: 'announce-dismissed',
  RECENT_SEARCHES: 'recent-searches',
};
