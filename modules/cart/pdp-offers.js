/**
 * pdp-offers.js — the offers block on a product page.
 *
 * WHY THIS LIVES IN modules/cart
 * ------------------------------
 * The rules being displayed are cart's rules: its promotions table, its gift
 * threshold. Putting the display in `catalog` would mean catalog rendering
 * decisions it does not own and cannot verify, and would leave this block
 * behind if cart were ever removed. It rides onto the product page the same way
 * modules/bundle does — one entry in tools/assemble.py, and it mounts itself.
 *
 * WHAT IT WILL AND WILL NOT SAY
 * -----------------------------
 * Every rule here is one the checkout actually enforces, and every rule states
 * its condition. A badge that says "-19%" tells a customer what happened to
 * this price; it does not tell them there is ৳ 500 waiting at ৳ 3,000, or that
 * the 10% code caps out at ৳ 1,000. Those are the facts that change what people
 * put in a basket, and they are the ones usually left off.
 *
 * The one exception is volume pricing, which is quoted by the B2B desk rather
 * than applied by the cart. It is shown — a buyer of 10,000 switches needs to
 * know it exists — but labelled as quoted, because a price the cart will not
 * charge must never be printed as if it will.
 */

import { getPublicOffers, describeOffers } from './backend/api.js';
import { getProductById } from '../catalog/backend/api.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { getParam } from '../../shared/js/core/router-helpers.js';

init();

async function init() {
  const id = getParam('id');
  if (!id) return;

  let product;
  let offers;
  try {
    [product, offers] = await Promise.all([getProductById(id), getPublicOffers()]);
  } catch (err) {
    // Offers are an enhancement. A product page without them is still a
    // complete product page.
    console.warn('[offers] could not load', err);
    return;
  }
  if (!product) return;

  // Evaluate against the smallest amount that can actually be bought, not the
  // unit price. A tactile switch is ৳ 3.20 a unit but cannot be ordered below
  // 1,000 of them, so the real entry ticket is ৳ 3,200 — and against the unit
  // price the block was telling a B2B buyer to "add ৳ 997 more to qualify" for
  // an offer their minimum order clears three times over.
  const qty = Math.max(1, Number(product.moq) || 1);
  const entryValue = product.price * qty;

  const rows = [
    ...describeOffers(entryValue, offers).map((o) => offerRow(o, qty)),
    ...volumeRow(product),
  ].filter(Boolean);

  if (!rows.length) return;

  mount(`
    <section class="offers" data-pdp-offers aria-labelledby="offers-head">
      <h2 class="offers__head" id="offers-head">Offers on this item</h2>
      <ul class="offers__list" role="list">${rows.join('')}</ul>
    </section>`);
}

function mount(html) {
  const info = document.querySelector('.pdp-info');
  if (!info) return;
  // Before the trust strip: it groups with the other reasons to buy, and does
  // not wedge itself between Add to Cart and Add to Wishlist, which is what
  // mounting higher in the column would do at 375px.
  const anchor = info.querySelector('.trust-strip');
  if (anchor) anchor.insertAdjacentHTML('beforebegin', html);
  else info.insertAdjacentHTML('beforeend', html);
}

function offerRow(o, qty) {
  const title = o.kind === 'gift' ? `Free ${escapeHtml(o.label)}` : escapeHtml(o.label);

  // Say WHY it qualifies when the reason is the minimum order rather than the
  // sticker price — otherwise "this item qualifies on its own" next to ৳ 3.20
  // reads as a bug.
  const qualifiedBy = qty > 1
    ? `The ${qty.toLocaleString('en-BD')}-unit minimum order qualifies`
    : 'This item qualifies on its own';

  return row({
    icon: o.kind === 'gift' ? giftIcon : tagIcon,
    title,
    detail: o.kind === 'gift' ? giftDetail(o) : promoDetail(o),
    status: o.qualifies
      ? `<span class="offers__ok">${qualifiedBy}</span>`
      : `<span class="offers__gap">Add ${formatBDT(o.shortfall)} more to qualify</span>`,
  });
}

function promoDetail(o) {
  const where = `Use code <strong>${escapeHtml(o.code)}</strong> at checkout on orders over ${formatBDT(o.minSpend)}.`;
  // Naming the cap matters: "10% off" on an ৳ 18,900 item reads as ৳ 1,890, and
  // the customer finds out at checkout that it is ৳ 1,000. Say it here instead.
  const worth = o.qualifies
    ? ` Worth ${formatBDT(o.benefit)} on this order${o.capped ? ' — the most this code gives' : ''}.`
    : ` Worth ${formatBDT(o.benefit)} at that point${o.capped ? ', which is this code’s cap' : ''}.`;
  return where + worth;
}

function giftDetail(o) {
  return `Added to your order automatically over ${formatBDT(o.minSpend)}. Worth ${formatBDT(o.benefit)}.`;
}

/**
 * Volume pricing for industrial parts.
 *
 * Only shown when there is a tier ABOVE the minimum order — the first tier is
 * usually just the MOQ restating the listed price, and calling that a discount
 * would be overselling it.
 */
function volumeRow(p) {
  const tiers = (p.priceTiers || []).filter((t) => t.min > (p.moq || 0) && t.price < p.price);
  if (!tiers.length) return [];

  const breaks = tiers
    .map((t) => `${formatBDT(t.price)}/unit from ${t.min.toLocaleString('en-BD')}`)
    .join(' · ');

  return [row({
    icon: boxIcon,
    title: 'Volume pricing',
    detail: `${breaks}.`,
    // The cart charges the listed unit price. Printing a tier price as though
    // checkout would apply it would be advertising a price we do not charge.
    status: `<span class="offers__note">Quoted by the B2B desk — <a href="/wholesale">request a quote</a>. The cart charges the listed unit price.</span>`,
  })];
}

function row({ icon, title, detail, status }) {
  return `
    <li class="offers__item">
      <span class="offers__icon" aria-hidden="true">${icon}</span>
      <div class="offers__body">
        <p class="offers__title">${title}</p>
        <p class="offers__detail">${detail}</p>
        <p class="offers__status">${status}</p>
      </div>
    </li>`;
}

const tagIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="20" height="20"><path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a1.4 1.4 0 0 1 0 2z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/></svg>';
const giftIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="20" height="20"><path d="M3 11h18v10H3zM3 7h18v4H3zM12 7v14"/><path d="M12 7S9.5 3 7.5 3a2 2 0 0 0 0 4zM12 7s2.5-4 4.5-4a2 2 0 0 1 0 4z"/></svg>';
const boxIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="20" height="20"><path d="M21 8 12 3 3 8l9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>';

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
