/**
 * delivery — the single source of truth for what delivery costs and how long it
 * takes. Every surface that quotes a price (cart summary, checkout options,
 * PDP copy, order confirmation) reads from here.
 *
 * Why flat, and why no free-delivery threshold:
 * the catalog runs from a 1kg bag of dates to 5-litre oil and boxed PCBs, so
 * weight-tiered pricing would make the customer do arithmetic before they know
 * what they owe. A flat charge per zone, stated in plain words, removes the
 * single biggest source of checkout anxiety. A free-delivery threshold is
 * handled instead as a gift reward (see the promotions work), which costs COGS
 * rather than margin and seeds trial of another SKU.
 *
 * Zones are commercial, not geographic: Chattogram is a metro tier alongside
 * Dhaka, while Dhaka-adjacent districts like Gazipur and Narayanganj sit on the
 * outside rate.
 *
 * // TODO: backend — POST /checkout/shipping-quote should return these, resolved
 * from the customer's district, and the server must recompute before charging.
 */

export const DELIVERY_OPTIONS = [
  {
    id: 'metro',
    label: 'Dhaka & Chattogram',
    sub: 'Within 72 hours',
    eta: 'Within 72 hours',
    cost: 70,
  },
  {
    id: 'nationwide',
    label: 'Rest of Bangladesh',
    sub: '4 working days',
    eta: '4 working days',
    cost: 130,
  },
  {
    id: 'express',
    label: 'Express — Dhaka only',
    sub: 'Next working day',
    eta: 'Next working day',
    cost: 150,
  },
];

/** The rate we quote before the customer has told us where they are. */
export const DEFAULT_OPTION = DELIVERY_OPTIONS[0];

export function deliveryOption(id) {
  return DELIVERY_OPTIONS.find((o) => o.id === id) || DEFAULT_OPTION;
}

export function deliveryCost(id) {
  return deliveryOption(id).cost;
}

/** Perishables ship cold-chain at no extra charge — it is the brand promise,
 *  so it must never appear as a surcharge line. */
export const COLD_CHAIN_INCLUDED = true;
