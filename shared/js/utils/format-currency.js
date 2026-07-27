/**
 * format-currency — Bangladeshi Taka (BDT) formatting for the whole storefront.
 * Renders e.g. 12500 -> "৳ 12,500". Whole-taka by default (imported retail
 * prices are quoted in whole taka); pass fractionDigits for paisa if needed.
 *
 * Keep ALL price rendering going through here so the currency symbol, grouping
 * and rounding stay identical in cards, cart, drawer and checkout.
 */

const BDT = new Intl.NumberFormat('en-BD', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * @param {number} amount           value in whole taka
 * @param {object} [opts]
 * @param {boolean}[opts.symbol]    prepend "৳ " (default true)
 * @param {number} [opts.fractionDigits]
 * @returns {string}
 */
export function formatBDT(amount, { symbol = true, fractionDigits } = {}) {
  const n = Number.isFinite(amount) ? amount : 0;

  // Sub-taka amounts keep their paisa automatically. Component prices are real
  // fractions — a tactile switch is ৳ 3.20 and its 10,000-unit tier is ৳ 2.60 —
  // and rounding both to whole taka printed "৳ 3" for each, so the listed price
  // and the volume price looked identical and the customer was quoted a number
  // they would not be charged. Above ৳ 100 nothing in this catalogue carries
  // meaningful paisa, so whole taka stays the default and every retail price
  // renders exactly as before.
  const digits = fractionDigits ?? (Math.abs(n) > 0 && Math.abs(n) < 100 && !Number.isInteger(n) ? 2 : null);

  const formatter = digits != null
    ? new Intl.NumberFormat('en-BD', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : BDT;
  const body = formatter.format(n);
  return symbol ? `৳ ${body}` : body;
}

/** Percentage-off label from original/current price, e.g. "-20%". Empty if none. */
export function discountLabel(original, current) {
  if (!original || original <= current) return '';
  const pct = Math.round(((original - current) / original) * 100);
  return pct > 0 ? `-${pct}%` : '';
}

/**
 * Absolute saving, e.g. "Save ৳ 350". Empty when there is no discount.
 *
 * Shown alongside the percentage rather than instead of it: in a price-sensitive
 * market the taka figure lands harder than the percent, because "19% off" needs
 * arithmetic against a price the shopper has not memorised. Shajgoj states the
 * discount four ways for exactly this reason.
 */
export function savingsLabel(original, current) {
  if (!original || original <= current) return '';
  return `Save ${formatBDT(original - current)}`;
}
