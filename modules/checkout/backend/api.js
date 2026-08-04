/**
 * Checkout · module API
 *
 * createOrder() is the seam both checkouts share — the four-step cart checkout
 * and the express ad-landing page. It does the real thing when a backend is
 * up, and says so honestly when one is not:
 *
 *   { ok: true,  order }     placed server-side; `order` is the server's
 *                            record, every figure recomputed there
 *   { ok: false, message }   the server REFUSED — out of stock, bad district,
 *                            a dead promo. The customer can act on the message.
 *   null                     no backend at all. The caller falls back to the
 *                            localStorage mock, which is what this shop is
 *                            until the API deploys — a fallback, not an error.
 *
 * The refused/absent distinction is the whole design: a 422 must stop the sale
 * and say why, while a 404 from a static file server must stop nothing.
 *
 * WHY A CART SYNC HAPPENS HERE
 * ----------------------------
 * The server (rightly) computes an order from ITS OWN cart — OrderService
 * locks the cart rows and recomputes every price; PlaceOrderRequest carries no
 * figures at all. But this storefront's cart lives in localStorage. So placing
 * an order means: make the server cart match the basket the customer is
 * looking at (clear, then add each line), apply the promo, then POST the
 * order. The guest-cart cookie ties the three steps to one cart.
 */
import { storage, KEYS } from '../../../shared/js/core/storage.js';

const API = '/api';

/** 404 = static server; 501 = a static server refusing POST/DELETE. Same
 *  reasoning as isBackendAbsent in modules/admin/backend/api.js. */
const backendAbsent = (res) => res.status === 404 || res.status === 501;

function api(path, options = {}) {
  const { headers: extra, ...rest } = options;
  return fetch(`${API}${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(extra || {}) },
  });
}

/**
 * Place an order on the server.
 *
 * @param {object} p
 * @param {Array<{sku:string, qty:number, variant:?string}>} p.items
 * @param {string}  p.name
 * @param {string}  p.phone
 * @param {?string} p.email
 * @param {string}  p.address   street address
 * @param {?string} p.area      thana / area
 * @param {string}  p.district  district KEY, the delivery module's vocabulary
 * @param {?string} p.notes
 * @param {string}  p.delivery  zone key — metro / nationwide / express
 * @param {string}  p.payment   cod / bkash / nagad / card
 * @param {?string} p.promoCode
 * @param {?object} p.source    first-touch UTM set (analytics.js)
 * @param {?string} p.eventId   the Purchase pixel event id, for CAPI dedupe
 * @returns {Promise<{ok:true, order:object}|{ok:false, message:string}|null>}
 */
export async function createOrder(p) {
  try {
    // 1 · Make the server cart the basket the customer is looking at.
    // Clear first: a stale server cart from an earlier visit must not smuggle
    // lines into an order the customer never saw. A failed clear is not fatal
    // — a brand-new guest has nothing to clear.
    await api('/cart', { method: 'DELETE' }).catch(() => null);

    for (const line of p.items) {
      const res = await api('/cart/items', {
        method: 'POST',
        body: JSON.stringify({ sku: line.sku, qty: line.qty, variant: line.variant ?? null }),
      });

      if (backendAbsent(res)) return null;
      if (!res.ok) {
        // Out of stock or withdrawn — the server names the problem. Stop the
        // sale here, BEFORE an order that silently omits a line.
        const body = await res.json().catch(() => ({}));
        return { ok: false, message: body.message || 'One of the items is no longer available.' };
      }
    }

    // 2 · The promo the customer saw applied. A code the server now refuses
    // must stop the sale rather than quietly charge the undiscounted total.
    if (p.promoCode) {
      const res = await api('/cart/promo', {
        method: 'POST',
        body: JSON.stringify({ code: p.promoCode }),
      });
      if (backendAbsent(res)) return null;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, message: body.message || 'That promo code is no longer valid.' };
      }
    }

    // 3 · The order. No figures in the payload — the server recomputes every
    // number from the cart it just built, which is the module's founding rule.
    const res = await api('/orders', {
      method: 'POST',
      body: JSON.stringify({
        name: p.name,
        phone: p.phone,
        email: p.email || null,
        address: p.address,
        area: p.area || null,
        district: p.district,
        notes: p.notes || null,
        delivery: p.delivery,
        payment: p.payment,
        source: p.source || null,
        eventId: p.eventId || null,
      }),
    });

    if (backendAbsent(res)) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, message: body.message || 'The order could not be placed. Please check your details.' };
    }

    const { data } = await res.json();
    return { ok: true, order: data };
  } catch {
    // Network down mid-flow. Nothing was charged (COD, and gateways are not
    // integrated); the caller decides between retry copy and the local mock.
    return null;
  }
}

/**
 * The localStorage order record, shared by both checkouts. One writer, one
 * shape — the confirmation page, the track page and the account history all
 * read this, whether the order also reached the server or not.
 */
export function persistOrderLocally(order) {
  const orders = storage.get(KEYS.ORDERS, []);
  orders.unshift(order);
  storage.set(KEYS.ORDERS, orders);
  storage.set('last-order', order);
  return order;
}

/**
 * Delivery pricing is owned by modules/delivery — checkout asks, it never
 * decides. Re-exported here so checkout code has one import surface.
 * @see modules/delivery/backend/endpoints.md
 */
export { getDeliveryOptions as getShippingQuote, quoteForDistrict } from '../../delivery/backend/api.js';
