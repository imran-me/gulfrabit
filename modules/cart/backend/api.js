/**
 * Cart · module API — the seam between the storefront cart and the server.
 *
 * Today the cart itself lives in `shared/js/core/state.js` (localStorage),
 * because a guest cart has to work before there is a backend at all. These
 * functions are where the server cart slots in; the shapes below already match
 * `endpoints.md`, so wiring them up changes no rendering code.
 *
 *   GET    /api/cart                    -> { data: CartPayload }
 *   POST   /api/cart/items              { sku, qty, variant }
 *   PATCH  /api/cart/items/{lineId}     { qty }   // qty 0 removes
 *   DELETE /api/cart/items/{lineId}
 *   POST   /api/cart/promo              { code }
 *   POST   /api/cart/merge              (auth, immediately after login)
 */

import { loadJSON } from '../../../shared/js/core/json-cache.js';
import { siteURL } from '../../../shared/js/core/paths.js';

// Cart owns its reward rules, the same way catalog owns products.
const REWARDS_URL = siteURL('modules/cart/data/rewards.json');

/**
 * Mock promo fixtures, mirroring the seeded rows in
 * `Seeders/PromotionSeeder.php` so the pre-backend cart behaves like the real
 * one — same codes, same minimum spends, same caps.
 *
 * They are a FIXTURE, never an authority: a discount the browser can name is a
 * discount the browser can invent. `PromotionService` has the real word, and
 * the order pipeline recomputes it regardless of what happened here.
 */
const MOCK_PROMOS = {
  GULF10: { type: 'pct',  value: 10,  minSpend: 1000, maxDiscount: 1000, label: '10% off your order' },
  HOP500: { type: 'flat', value: 500, minSpend: 3000, maxDiscount: null, label: '৳ 500 off' },
};

/**
 * Validate a promo code against a goods subtotal.
 *
 * Returns the same shape as `PromotionService::validate()`, including the
 * distinction between "no such code" and "your basket is too small" — the
 * second is actionable, and collapsing both into "invalid code" loses a sale.
 *
 * @param {string} code
 * @param {number} subtotal goods subtotal in whole BDT
 * @returns {Promise<{valid:boolean, reason:string|null, discount:number, label:string|null, minSpend?:number}>}
 */
export async function validatePromo(code, subtotal = 0) {
  // TODO: backend — POST /api/cart/promo
  const promo = MOCK_PROMOS[code?.trim().toUpperCase()];

  if (!promo) {
    return { valid: false, reason: 'unknown', discount: 0, label: null };
  }

  if (subtotal < promo.minSpend) {
    return { valid: false, reason: 'min_subtotal', discount: 0, label: promo.label, minSpend: promo.minSpend };
  }

  let discount = promo.type === 'pct'
    ? Math.floor(subtotal * promo.value / 100)
    : promo.value;

  if (promo.maxDiscount !== null) discount = Math.min(discount, promo.maxDiscount);
  discount = Math.min(discount, subtotal);      // never more than the goods are worth

  return { valid: true, reason: null, discount, label: promo.label };
}

/**
 * Progress toward the gift-with-purchase threshold.
 *
 * Mirrors GiftReward::progressFor() exactly — including returning progress when
 * the threshold is NOT met, because "add ৳X more" is the part of this mechanic
 * that actually moves basket size. Hiding it until unlocked would waste it.
 *
 * @param {number} subtotal goods subtotal in whole BDT
 * @returns {Promise<null|{key:string,unlocked:boolean,threshold:number,remaining:number,percent:number,teaser:string,label:string,image:string,sku:string}>}
 */
export async function getGiftProgress(subtotal = 0) {
  // TODO: backend — this arrives inside GET /api/cart as `data.gift`.
  const reward = await loadRewards();
  if (!reward) return null;

  const unlocked = subtotal >= reward.thresholdTaka;

  return {
    key:       reward.id,
    unlocked,
    threshold: reward.thresholdTaka,
    remaining: unlocked ? 0 : reward.thresholdTaka - subtotal,
    // Clamped: a basket past the threshold must not render a bar wider than
    // its track.
    percent:   Math.min(100, Math.floor(subtotal / reward.thresholdTaka * 100)),
    teaser:    reward.teaser,
    label:     reward.label,
    image:     reward.image,
    sku:       reward.productSku,
  };
}

/** Lowest active threshold — chase the nearest reward, not a distant bigger one. */
async function loadRewards() {
  const { rewards } = await loadJSON(REWARDS_URL);
  return rewards
    .filter((r) => r.isActive)
    .sort((a, b) => a.thresholdTaka - b.thresholdTaka)[0] ?? null;
}

/**
 * Push the local cart to the server.
 * // TODO: backend — POST /api/cart/items per line, or a bulk sync endpoint.
 */
export async function syncCartToServer(/* cart */) {
  return true;
}

/**
 * Fold the guest cart into the user's after login.
 * // TODO: backend — POST /api/cart/merge. Quantities ADD, they never overwrite.
 */
export async function mergeGuestCart() {
  return true;
}
