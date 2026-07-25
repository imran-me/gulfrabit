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

export async function getShippingQuote(/* address, cart */) {
  // TODO: backend — POST /checkout/shipping-quote.
  // Mirrors shared/js/core/delivery.js — cold-chain is NOT a line item; it is
  // included on perishables, which is what the site promises on every page.
  return DELIVERY_OPTIONS.map(({ id, label, cost }) => ({ id, label, cost }));
}
