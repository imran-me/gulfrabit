/**
 * orders-page.js — order history, with status filters.
 *
 * The merging of localStorage and the fixture used to happen here AND in
 * backend/api.js, in two copies that had drifted apart in their de-duplication.
 * It happens in getOrders() now, which also asks the server first — see the
 * note there for why that stopped being optional once these rows started
 * offering "Review this".
 */
import { getOrders } from './backend/api.js';
import { textSkeletons } from '../../shared/js/components/skeleton-loader.js';
import { siteURL, productURL } from '../../shared/js/core/paths.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { ensureSession, wireLogout, statusBadge } from './account-common.js';

ensureSession();
wireLogout();

const listEl = document.querySelector('[data-orders-list]');
const emptyEl = document.querySelector('[data-orders-empty]');
/** { ok:true, orders } | { ok:false, reason } — see getOrders(). */
let result = { ok: true, orders: [] };
let filter = 'all';

init();

async function init() {
  document.querySelectorAll('[data-filter]').forEach((btn) => btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((b) => { b.classList.toggle('is-active', b === btn); b.classList.toggle('btn-outline-gr', b === btn); b.classList.toggle('btn-ghost-gr', b !== btn); });
    render();
  }));

  await load();
}

async function load() {
  // Something to look at while the request is out. The region used to be an
  // empty div under four filter buttons — on a slow connection, whitespace
  // with no explanation for as long as it took.
  emptyEl.hidden = true;
  listEl.innerHTML = Array.from({ length: 2 }, () =>
    `<article class="order-card surface-gr" aria-hidden="true">${textSkeletons(4, ['35%', '90%', '80%', '45%'])}</article>`).join('');

  result = await getOrders().catch(() => ({ ok: false, reason: 'error' }));
  render();
}

/**
 * Every reason the list can be empty says which one it is.
 *
 * "No orders yet" is a claim about the customer's history. It must not be how
 * the page reports a 500 or a 401 — a customer told their purchases are gone
 * during an outage will reasonably re-place an order they already have.
 */
function render() {
  if (!result.ok) {
    return showState(result.reason === 'auth'
      ? {
          title: 'Sign in to see your orders',
          text: 'Your order history lives with your account.',
          action: `<a class="btn-gr btn-primary-gr" href="${siteURL('login')}">Sign in</a>`,
        }
      : {
          title: 'We could not load your orders',
          text: 'Something went wrong at our end — your orders are safe. Please try again.',
          action: '<button class="btn-gr btn-primary-gr" type="button" data-orders-retry>Try again</button>',
        });
  }

  const list = filter === 'all' ? result.orders : result.orders.filter((o) => o.status === filter);

  if (!list.length) {
    return showState(filter === 'all'
      ? {
          title: 'No orders yet',
          text: 'When you place an order it will appear here.',
          action: '<a class="btn-gr btn-primary-gr" href="/">Start shopping</a>',
        }
      : {
          title: 'Nothing here',
          text: `You have no ${filter} orders. Try another filter.`,
          action: '',
        });
  }

  emptyEl.hidden = true;
  listEl.innerHTML = list.map(orderCard).join('');
}

function showState({ title, text, action }) {
  listEl.innerHTML = '';
  emptyEl.innerHTML = `
    <h2 class="empty-state__title">${title}</h2>
    <p class="empty-state__text">${text}</p>
    ${action}`;
  emptyEl.hidden = false;
  emptyEl.querySelector('[data-orders-retry]')?.addEventListener('click', load);
}

function orderCard(o) {
  return `
    <article class="order-card surface-gr">
      <div class="order-card__head">
        <div><strong>${o.id}</strong><div class="caption">Placed ${o.date}</div></div>
        <div style="display:flex;align-items:center;gap:1rem">${statusBadge(o.status)}<strong class="tabular">${formatBDT(o.total)}</strong></div>
      </div>
      ${o.items.map((it) => `<div class="order-item-row">
        <img src="${it.image}" alt="">
        <span class="order-item-row__title">${escapeHtml(it.title)}</span>
        ${reviewLink(o, it)}
        <span class="order-item-row__meta"><span class="caption">×${it.qty}</span
          ><span class="tabular caption">${formatBDT(it.price * it.qty)}</span></span>
      </div>`).join('')}
      <div style="display:flex;gap:.75rem;margin-top:1rem">
        <a class="btn-gr btn-outline-gr btn-sm-gr" href="${siteURL(`track?id=${encodeURIComponent(o.id)}`)}">Track</a>
        ${o.status === 'delivered' ? '<button class="btn-gr btn-ghost-gr btn-sm-gr" type="button">Buy again</button>' : ''}
      </div>
    </article>`;
}

/**
 * "Review this" on a line of a delivered order.
 *
 * THIS IS THE ONLY ROUTE ANYONE WILL TAKE to the review form. The form itself
 * lives on the product page, and nobody navigates back to a product page a
 * week after delivery to look for one — a review system with no invitation
 * collects nothing, which is how a shop ends up tempted to invent them.
 *
 * Shown on delivered orders only, which is also exactly when the server will
 * accept a review; offering it any earlier would be a link to a refusal.
 *
 * Whether this customer has ALREADY reviewed the product is not checked here.
 * It would cost a request per line on a page that renders a dozen, and the
 * product page answers it properly a click later — with the right sentence,
 * from the one place that knows the rule.
 */
function reviewLink(order, item) {
  if (order.status !== 'delivered' || !item.id) return '';

  return `<a class="order-item-row__review" href="${productURL(item.id)}#reviews">Review this</a>`;
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
