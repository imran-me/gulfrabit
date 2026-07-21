/**
 * B2B · module API (mock)
 * Reads industrial products from the shared data-service and fakes RFQ submit.
 */
import { getProductsByCategory } from '../../../shared/js/core/data-service.js';

export async function getIndustrialProducts() {
  return getProductsByCategory('industrial-raw-materials');
}

export async function submitRFQ(/* payload */) {
  // TODO: backend — POST /b2b/rfq → create CRM ticket + email confirmation.
  return { ok: true, ticket: 'RFQ-MOCK' };
}

/** Resolve unit price for a quantity from a product's tiers. */
export function resolveTierPrice(product, qty) {
  const tiers = (product.priceTiers || []).slice().sort((a, b) => b.min - a.min);
  return (tiers.find((t) => qty >= t.min) || { price: product.price }).price;
}
