/**
 * slip-page.js — the packing slip that goes on the parcel.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every COD parcel needs a document: the rider needs the address and the amount
 * to collect, the customer needs to see what they are paying for, and the
 * warehouse needs to check what to put in the box. The panel had no printable
 * anything — while AdminCustomerController's own comment describes the warehouse
 * role as the person who "sees a delivery address on a packing slip". The
 * permission model was written around a document nobody had built.
 *
 * ONE DOCUMENT, NOT TWO
 * ---------------------
 * Not a separate packing slip and invoice. In this market the same sheet goes on
 * the parcel and acts as the customer's receipt, so it carries the items, the
 * prices and — the only figure the rider actually reads — the amount to collect,
 * set large and boxed. A prepaid order says PAID in the same place, because the
 * failure that costs real money is a rider collecting cash twice.
 *
 * NO NEW ENDPOINT
 * ---------------
 * It reads GET /orders/{no}, which already returns the items, the address, the
 * totals and the payment status. A print-specific endpoint would be a second
 * definition of what an order is, and the two would disagree the first time one
 * of them changed.
 *
 * BATCHES
 * -------
 * ?no=A,B,C prints many at once, one page each, because the alternative on a
 * busy morning is opening twenty tabs. Fetched in parallel; one order that fails
 * is reported on its own sheet rather than losing the other nineteen.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';

document.addEventListener('admin:ready', load);

function numbers() {
  return (new URLSearchParams(location.search).get('no') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function load() {
  const host = document.querySelector('[data-slips]');
  if (!host) return;

  const list = numbers();
  if (!list.length) {
    return fail('No order number in the link. Open an order and choose “Print slip”, '
      + 'or select orders on the list and print them together.');
  }

  // Settled, not all: one bad order number must not cost you the other
  // nineteen slips when a rider is waiting.
  const results = await Promise.all(list.map((no) =>
    adminFetch(`/orders/${encodeURIComponent(no)}`)
      .then((r) => ({ no, order: r.data }))
      .catch((err) => ({ no, error: err.message || 'Could not be loaded' }))));

  const ok = results.filter((r) => r.order).length;
  document.querySelector('[data-slip-count]').textContent =
    `${ok} slip${ok === 1 ? '' : 's'}${ok < list.length ? ` · ${list.length - ok} could not be loaded` : ''}`;

  host.innerHTML = results.map((r) => r.order ? slip(r.order) : broken(r)).join('');

  document.querySelector('[data-slip-print]').addEventListener('click', () => window.print());

  // Straight to the print dialog when the link says so. Bulk printing from the
  // orders list opens this page already meaning to print, and the extra click
  // is pure friction on the twentieth parcel.
  if (new URLSearchParams(location.search).get('auto') === '1') {
    // After paint, or the dialog captures a half-rendered page.
    requestAnimationFrame(() => setTimeout(() => window.print(), 60));
  }
}

function slip(o) {
  const d = o.delivery;
  const c = o.customer;
  const t = o.totals;

  // What the rider collects at the door — the one number on this sheet that
  // costs money if it is wrong. A prepaid order must never show an amount here.
  const collect = o.paymentStatus === 'paid' ? null : t.totalTaka;

  return `
    <article class="slip">
      <header class="slip__head">
        <div class="slip__brand">
          <strong>GulfRabit</strong>
          <span>Premium imports · gulfrabit.com</span>
        </div>
        <div class="slip__ref">
          <strong>${escapeHtml(o.orderNumber)}</strong>
          <span>${when(o.placedAt)}</span>
        </div>
      </header>

      <section class="slip__to">
        <h2>Deliver to</h2>
        <p class="slip__name">${escapeHtml(c.name)}</p>
        <p class="slip__phone">${escapeHtml(c.phone)}</p>
        <p>${escapeHtml(d.address)}${d.area ? `, ${escapeHtml(d.area)}` : ''}</p>
        <p><strong>${escapeHtml(d.district)}</strong></p>
        ${d.notes ? `<p class="slip__note">Note: ${escapeHtml(d.notes)}</p>` : ''}
      </section>

      <table class="slip__items">
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody>
          ${o.items.map((i) => `
            <tr>
              <td>${escapeHtml(i.title)}${i.variant ? `<br><span class="slip__variant">${escapeHtml(i.variant)}</span>` : ''}</td>
              <td class="slip__n">${i.qty}</td>
              <td class="slip__n">৳ ${money(i.lineTaka)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="2">Subtotal</td><td class="slip__n">৳ ${money(t.subtotalTaka)}</td></tr>
          ${t.discountTaka ? `<tr><td colspan="2">Discount${o.promoCode ? ` (${escapeHtml(o.promoCode)})` : ''}</td><td class="slip__n">− ৳ ${money(t.discountTaka)}</td></tr>` : ''}
          <tr><td colspan="2">Delivery</td><td class="slip__n">৳ ${money(t.deliveryTaka)}</td></tr>
          <tr class="slip__total"><td colspan="2">Total</td><td class="slip__n">৳ ${money(t.totalTaka)}</td></tr>
        </tfoot>
      </table>

      <div class="slip__collect ${collect === null ? 'is-paid' : ''}">
        ${collect === null
          ? '<strong>PAID IN ADVANCE</strong><span>Collect nothing at the door</span>'
          : `<strong>COLLECT ৳ ${money(collect)}</strong><span>Cash on delivery${
              o.paymentMethod ? ` · ${escapeHtml(o.paymentMethod)}` : ''}</span>`}
      </div>

      <footer class="slip__foot">
        <span>7-day returns on unopened non-perishables · gulfrabit.com</span>
        <span>${escapeHtml(o.orderNumber)}</span>
      </footer>
    </article>`;
}

function broken(r) {
  return `
    <article class="slip slip--broken">
      <h2>${escapeHtml(r.no)}</h2>
      <p>${escapeHtml(r.error)}</p>
      <p class="slip__variant">The other slips printed. Check this order number and print it on its own.</p>
    </article>`;
}

function fail(message) {
  const el = document.querySelector('[data-slip-error]');
  el.textContent = message;
  el.hidden = false;
  document.querySelector('[data-slip-count]').textContent = 'Nothing to print';
}

const money = (n) => Number(n || 0).toLocaleString('en-BD');

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
