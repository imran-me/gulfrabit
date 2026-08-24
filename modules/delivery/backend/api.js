/**
 * Delivery · module API — the frontend's only door to delivery pricing.
 *
 * This is the seam. Today it reads the module's own districts.json and the
 * zone table below; when the Laravel backend lands, only the bodies of these
 * three functions change to `fetch()` calls. No caller is touched, because the
 * shapes returned here already match what the controller returns:
 *
 *   GET  /api/delivery/options    -> { data: Quote[] }
 *   GET  /api/delivery/districts  -> { data: { [division]: District[] } }
 *   POST /api/delivery/quote      -> { data: Quote }
 *
 * @typedef {{ id: string, label: string, eta: string, cost: number }} Quote
 * @typedef {{ key: string, name: string, zone: string }} District
 */

import { siteURL } from '../../../shared/js/core/paths.js';

/**
 * Zone rates. Mirrors modules/delivery/backend/Seeders/DeliveryZoneSeeder.php —
 * when the API goes live this constant is deleted and options() fetches instead.
 *
 * Flat per zone, whatever the order weighs or is worth. The catalog runs from a
 * 1kg bag of dates to 5-litre oil and boxed PCBs, so weight tiers would make the
 * customer do arithmetic before they know what they owe.
 *
 * @type {Quote[]}
 */
// GENERATED-DELIVERY-BEGIN 
const ZONES = [
  { id: 'metro', label: 'Dhaka & Chattogram', eta: 'Within 72 hours', cost: 70 },
  { id: 'nationwide', label: 'Rest of Bangladesh', eta: '4 working days', cost: 130 },
  { id: 'express', label: 'Express — Dhaka only', eta: 'Next working day', cost: 150 },
];
// GENERATED-DELIVERY-END /** The rate quoted before the customer has told us where they are. */
export const DEFAULT_OPTION = ZONES[0];

let districtCache = null;

/**
 * Every active delivery option, cheapest first.
 * @returns {Promise<Quote[]>}
 */
export async function getDeliveryOptions() {
  // TODO: backend — GET /api/delivery/options
  return ZONES.map((z) => ({ ...z }));
}

/**
 * Districts grouped by division, for the checkout select.
 * @returns {Promise<Record<string, District[]>>}
 */
export async function getDistrictsByDivision() {
  // TODO: backend — GET /api/delivery/districts
  if (districtCache) return districtCache;

  const url = siteURL('modules/delivery/data/districts.json');

  // Three attempts before giving up. The one outcome checkout cannot survive
  // is an empty select: the district field is marked required, so a single
  // request dropped by a phone that changed cell tower mid-load leaves a box
  // with nothing in it and a Place Order button that can never be satisfied.
  // Half a second of retrying turns a lost order into a slightly slow one.
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    try {
      return await fetchDistricts(url);
    } catch (err) {
      lastError = err;
    }
  }

  // Rethrown rather than answered with an empty object: {} is a valid-looking
  // answer that yields a select with no options and nothing on screen to
  // explain it. Callers catch this and say so in the field itself —
  // wireDistricts() in checkout-page.js, fillDistricts() in express-page.js.
  throw lastError;
}

/**
 * One attempt at the district file, memoised on success.
 *
 * @param {string} url
 * @returns {Promise<Record<string, District[]>>}
 */
async function fetchDistricts(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`districts.json ${res.status}`);
  const { districts } = await res.json();

  // A body that parses but carries no districts is a failure, not an empty
  // country. Caching {} for it would hand every later caller a select with no
  // options that never rejects, so nothing downstream would know to say why.
  if (!Array.isArray(districts) || districts.length === 0) throw new Error('districts.json carried no districts');

  districtCache = districts.reduce((byDivision, d) => {
    (byDivision[d.division] ||= []).push({ key: d.id, name: d.name, zone: d.zone });
    return byDivision;
  }, {});

  return districtCache;
}

/**
 * The charge for one district — what checkout actually bills.
 *
 * Returns null for an unknown district rather than falling back to the cheapest
 * zone: quoting metro for an unserviceable address would undercharge and the
 * order would ship at a loss. Callers must handle null, not paper over it.
 *
 * @param {string} districtKey slug from the select, e.g. 'coxs-bazar'
 * @returns {Promise<Quote|null>}
 */
export async function quoteForDistrict(districtKey) {
  // TODO: backend — POST /api/delivery/quote { district }
  if (!districtKey) return null;

  const byDivision = await getDistrictsByDivision();
  const district = Object.values(byDivision)
    .flat()
    .find((d) => d.key === districtKey);

  if (!district) return null;

  return ZONES.find((z) => z.id === district.zone) ?? null;
}

/**
 * Look up a zone by its key. Used to render a stored order's delivery line
 * without re-quoting it — a historical order keeps the price it was charged.
 * @param {string} id
 * @returns {Quote}
 */
export function deliveryOption(id) {
  return ZONES.find((z) => z.id === id) ?? DEFAULT_OPTION;
}
