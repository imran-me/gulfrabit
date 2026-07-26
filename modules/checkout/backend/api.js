/**
 * Checkout · module API
 * Mock order creation writes to localStorage (see checkout-page.js). The seam:
 * replace createOrder() with POST /orders and integrate the payment gateway.
 */
import { storage, KEYS } from '../../../shared/js/core/storage.js';

export async function createOrder(order) {
  // TODO: backend — POST /orders (server recomputes totals) + payment intent.
  const orders = storage.get(KEYS.ORDERS, []);
  orders.unshift(order);
  storage.set(KEYS.ORDERS, orders);
  return { id: order.id, status: 'processing' };
}

/**
 * Delivery pricing is owned by modules/delivery — checkout asks, it never
 * decides. Re-exported here so checkout code has one import surface.
 * @see modules/delivery/backend/endpoints.md
 */
export { getDeliveryOptions as getShippingQuote, quoteForDistrict } from '../../delivery/backend/api.js';
