/**
 * confirmation-page.js — renders the just-placed order from localStorage.
 * Reads the "last-order" stash (or looks up by ?id= in local order history).
 *
 * ?payment=success|cancelled|failed arrives when the customer comes back via
 * the gateway callback (modules/payments). Whatever it says, the ORDER is
 * fine — the two failure messages exist to say exactly that out loud, because
 * a customer bounced back from a failed bKash screen assumes the worst.
 */

import { deliveryOption } from '../delivery/backend/api.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { getParam } from '../../shared/js/core/router-helpers.js';
import { siteURL } from '../../shared/js/core/paths.js';

const id = getParam('id');
let order = storage.get('last-order', null);
if (!order || (id && order.id !== id)) {
  order = (storage.get(KEYS.ORDERS, []) || []).find((o) => o.id === id) || order;
}

if (!order) {
  document.querySelector('#main').innerHTML =
    `<div class="empty-state"><h1 class="empty-state__title">No recent order</h1><p class="empty-state__text">We couldn’t find that order.</p><a class="btn-gr btn-primary-gr" href="${siteURL('')}">Back to home</a></div>`;
} else {
  setText('[data-order-id]', order.id);
  document.querySelector('[data-track-link]')?.setAttribute('href', siteURL(`track?id=${encodeURIComponent(order.id)}`));
  setText('[data-order-address]', order.address || '—');
  setText('[data-order-total]', formatBDT(order.total));
  setText('[data-order-eta]', deliveryOption(order.delivery).eta);
  document.querySelector('[data-order-items]').innerHTML = order.items.map((it) => `
    <div class="cart-line" style="grid-template-columns:48px 1fr auto">
      <img class="cart-line__thumb" style="width:48px;height:48px" src="${it.image}" alt="">
      <div><div class="cart-line__title">${escapeHtml(it.title)}</div><div class="cart-line__meta">Qty ${it.qty}</div></div>
      <div class="cart-line__price">${formatBDT(it.price * it.qty)}</div>
    </div>`).join('');
}

paintPaymentVerdict(getParam('payment'));

/**
 * Say what happened at the gateway, in the customer's terms. Success gets the
 * quiet good news; both failure shapes lead with "your order still stands",
 * because that is the question the customer is actually asking.
 */
function paintPaymentVerdict(verdict) {
  const el = document.querySelector('[data-payment-verdict]');
  if (!el || !verdict) return;

  const paint = (text, bg, fg) => {
    el.textContent = text;
    el.style.background = bg;
    el.style.color = fg;
    el.hidden = false;
  };

  if (verdict === 'success') {
    paint('Payment received — you’re all set. The transaction id is in your bKash/Nagad app.',
      'var(--gr-lime-light)', 'var(--gr-ink)');
  } else if (verdict === 'cancelled') {
    paint('You didn’t finish the online payment — no problem. Your order stands; pay the courier in cash on delivery.',
      'var(--gr-off-white)', 'var(--gr-ink)');
  } else if (verdict === 'failed') {
    paint('The online payment didn’t go through, but your order still stands — pay cash on delivery, or call us to try again.',
      'var(--gr-off-white)', 'var(--gr-ink)');
  }
}

function setText(sel, v) { const el = document.querySelector(sel); if (el) el.textContent = v; }
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
