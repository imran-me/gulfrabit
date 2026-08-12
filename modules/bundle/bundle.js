/**
 * bundle.js — the "buy it together" block on a product page.
 *
 * SELF-MOUNTING ON PURPOSE
 * ------------------------
 * This file injects its own section rather than filling a placeholder that
 * lives in the catalog module's markup. Delete `modules/bundle/` and remove its
 * two lines from `tools/assemble.py` and the feature is gone — no orphan
 * `<div>` left behind in somebody else's fragment. That is the module test this
 * project is built to, applied to a feature that spans two pages' worth of UI.
 *
 * THE SAVING IS REAL MONEY
 * ------------------------
 * There is no bundle discount. The figure shown is the sum of
 * `originalPrice - price` across the ticked items — a saving the catalogue
 * already carries and the checkout already charges. Inventing a "bundle price"
 * would mean either lying about the total or teaching the promotions engine a
 * rule the server does not enforce, and the second one is how a storefront ends
 * up advertising a discount it will not honour.
 *
 * AND IT COUNTS IN THE UNITS THE PRODUCT IS ACTUALLY SOLD IN
 * ----------------------------------------------------------
 * Industrial parts carry an MOQ, and `price` is the unit price *at* that MOQ —
 * the first price tier and the listed price are the same number. So the board
 * kit is 50 blanks and 1,000 switches, not one of each, and the total says so.
 * "Add 1" on a part with a 1,000-unit minimum is an order the B2B desk would
 * have to phone up and correct.
 */

import { getBundleFor } from './backend/api.js';
import { addToCart } from '../../shared/js/core/state.js';
import { showToast } from '../../shared/js/components/toast-notifications.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { getParam } from '../../shared/js/core/router-helpers.js';
import { productURL } from '../../shared/js/core/paths.js';

const state = {
  bundle: null,
  /** Product ids currently ticked. The anchor is always in here. */
  picked: new Set(),
};

init();

/**
 * The 640px WebP beside a photograph, for an 88px thumbnail. The build writes
 * one next to every product JPEG; anything else (the placeholder SVGs) falls
 * through untouched.
 *
 * Emphatically NOT async — it returns a string that goes straight into a
 * src=. It carried a stray `async` (parked in front of this comment, which is
 * whitespace to the parser, so it bound here) that had come off init() below:
 * one keyword in the wrong place broke the module's parse AND would have put
 * "[object Promise]" in every thumbnail if it had ever got that far.
 */
function cardImage(src) {
  const s = String(src || '');
  return s.toLowerCase().endsWith('.jpg') ? s.slice(0, -4) + '-card.webp' : s;
}

/* `async` is load-bearing, not decoration. Without it the `await` below is a
   reserved word in the wrong place, this module fails to PARSE, and the whole
   file — not just the pairing — never runs. It failed silently too: the block
   is self-mounting, so a missing section looked exactly like a product with no
   pairing, and the only trace was one console error on every product page. */
async function init() {
  const id = getParam('id');
  if (!id) return;

  let bundle = null;
  try {
    bundle = await getBundleFor(id);
  } catch (err) {
    // A pairing is an enhancement. If it cannot load, the product page is still
    // a complete product page — fail quiet rather than fail loud.
    console.warn('[bundle] could not load pairing', err);
    return;
  }
  if (!bundle) return;

  state.bundle = bundle;
  state.picked = new Set([bundle.anchor.id, ...bundle.companions.map((p) => p.id)]);

  mount(render(bundle));
}

/** Insert after the PDP article, before the tabs, where the eye already is. */
function mount(html) {
  const anchorEl = document.querySelector('[data-pdp]');
  if (!anchorEl) return;
  anchorEl.insertAdjacentHTML('afterend', html);

  const root = document.querySelector('[data-bundle]');
  root.addEventListener('change', (e) => {
    const box = e.target.closest('[data-bundle-pick]');
    if (!box) return;
    const pid = box.dataset.bundlePick;
    if (box.checked) state.picked.add(pid); else state.picked.delete(pid);
    root.querySelector(`[data-bundle-item="${cssEscape(pid)}"]`)?.classList.toggle('is-off', !box.checked);
    paintTotals();
  });
  root.querySelector('[data-bundle-add]').addEventListener('click', addPicked);

  paintTotals();
}

/**
 * "Frequently bought together" is a claim about what other customers did. Until
 * the server has counted enough real orders to say it, the heading says what
 * this actually is: a pairing the merchant put together, with its reasoning
 * printed underneath so the customer can judge it.
 */
function heading(source) {
  return source === 'behavioural' ? 'Frequently bought together' : 'Goes well together';
}

function render(b) {
  const items = [b.anchor, ...b.companions];
  return `
  <section class="bundle" data-bundle aria-labelledby="bundle-head">
    <div class="bundle__head">
      <h2 class="h4" id="bundle-head">${escapeHtml(heading(b.source))}</h2>
      <p class="bundle__why">${escapeHtml(b.reason)}</p>
    </div>

    <div class="bundle__row">
      <!-- A plain grid, not a flex row with "+" between the cards. The
           separators forced their own width into the wrap calculation, so a
           bundle of five landed as four-plus-one-orphan at some widths. The
           summary panel already says these add up. -->
      <ul class="bundle__items" role="list">
        ${items.map((p, i) => itemHtml(p, i === 0)).join('')}
      </ul>

      <div class="bundle__summary surface-gr">
        <p class="bundle__count" data-bundle-count></p>
        <p class="bundle__total price" data-bundle-total></p>
        <p class="bundle__save" data-bundle-save hidden></p>
        <button class="btn-gr btn-primary-gr btn-block-gr" type="button" data-bundle-add><span class="btn-gr__en">Add selected to cart</span><span class="btn-bn bn" lang="bn">কার্টে যোগ করুন</span></button>
        <p class="caption bundle__note">Ticking items only changes what goes in your cart — each is charged at its own listed price.</p>
      </div>
    </div>
  </section>`;
}

function itemHtml(p, isAnchor) {
  const save = savingFor(p);
  const qty = qtyFor(p);
  return `
    <li class="bundle__item" data-bundle-item="${escapeHtml(p.id)}">
      <label class="bundle__pick">
        <input type="checkbox" data-bundle-pick="${escapeHtml(p.id)}" checked
               ${isAnchor ? 'aria-describedby="bundle-anchor-note"' : ''}>
        <span class="visually-hidden">Include ${escapeHtml(p.title)}</span>
      </label>
      <a class="bundle__thumb" href="${productURL(p)}">
        <picture><source srcset="${escapeHtml(cardImage(p.image))}" type="image/webp">
          <img src="${escapeHtml(p.image)}" alt="" loading="lazy" width="88" height="88"></picture>
      </a>
      <div class="bundle__meta">
        ${isAnchor ? '<span class="bundle__tag" id="bundle-anchor-note">This item</span>' : ''}
        <a class="bundle__title" href="${productURL(p)}">${escapeHtml(p.title)}</a>
        <span class="bundle__price price">${formatBDT(lineTotal(p))}${
          save ? ` <s class="bundle__was">${formatBDT(p.originalPrice * qty)}</s>` : ''
        }</span>
        ${qty > 1 ? `<span class="bundle__qty">${qty.toLocaleString('en-BD')} units · minimum order</span>` : ''}
      </div>
    </li>`;
}

/** How many units one tick of this product means. MOQ for B2B parts, else 1. */
function qtyFor(p) {
  return Math.max(1, Number(p.moq) || 1);
}

/** Real saving against the listed original price, for the whole line. 0 when
    not on offer. Multiplied by the quantity, because a ৳ 0.4 saving on a part
    ordered 1,000 at a time is ৳ 400, and the per-unit figure understates it. */
function savingFor(p) {
  const per = p.originalPrice && p.originalPrice > p.price ? p.originalPrice - p.price : 0;
  return per * qtyFor(p);
}

/** Line total: unit price × the quantity that tick actually adds. */
function lineTotal(p) {
  return p.price * qtyFor(p);
}

function paintTotals() {
  const root = document.querySelector('[data-bundle]');
  if (!root) return;

  const chosen = [state.bundle.anchor, ...state.bundle.companions]
    .filter((p) => state.picked.has(p.id));

  const total = chosen.reduce((s, p) => s + lineTotal(p), 0);
  const save = chosen.reduce((s, p) => s + savingFor(p), 0);

  root.querySelector('[data-bundle-count]').textContent =
    `${chosen.length} item${chosen.length === 1 ? '' : 's'} selected`;
  root.querySelector('[data-bundle-total]').textContent = formatBDT(total);

  const saveEl = root.querySelector('[data-bundle-save]');
  saveEl.hidden = save === 0;
  // Names what the saving is measured against. "You save ৳ 500" with nothing to
  // compare it to is the oldest trick in retail, and it is not one we use.
  saveEl.textContent = `You save ${formatBDT(save)} against the usual price`;

  const btn = root.querySelector('[data-bundle-add]');
  btn.disabled = chosen.length === 0;
  // innerHTML rather than textContent because the label carries the Bangla
  // gloss every other cart button on the site carries, and textContent would
  // strip the span on the first tick. `chosen.length` is a number we counted,
  // so there is nothing here to escape.
  const en = chosen.length === 1 ? 'Add 1 item to cart' : `Add ${chosen.length} items to cart`;
  btn.innerHTML = `<span class="btn-gr__en">${en}</span><span class="btn-bn bn" lang="bn">কার্টে যোগ করুন</span>`;
}

function addPicked() {
  const chosen = [state.bundle.anchor, ...state.bundle.companions]
    .filter((p) => state.picked.has(p.id));
  if (!chosen.length) return;

  // Each line goes in at its own minimum, not at 1.
  chosen.forEach((p) => addToCart(p, qtyFor(p)));
  showToast(
    `${chosen.length} item${chosen.length === 1 ? '' : 's'} added to your cart`,
    'success',
  );
}

/* Attribute selectors need escaping; product ids are safe today but a selector
   built from data is a selector waiting to be broken by the first id with a dot
   in it. */
function cssEscape(v) {
  return window.CSS?.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&');
}
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
