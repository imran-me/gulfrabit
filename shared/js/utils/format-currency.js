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
  const formatter = fractionDigits != null
    ? new Intl.NumberFormat('en-BD', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })
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
