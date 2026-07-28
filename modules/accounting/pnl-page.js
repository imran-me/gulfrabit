/**
 * pnl-page.js — profit & loss.
 *
 * The screen's real job is not the arithmetic; the server does that. It is to
 * make sure nobody reads a "profit" figure without also reading that cost of
 * goods is missing from it. So the caveat renders ABOVE the numbers and the
 * gross-profit card is not drawn at all when it cannot be computed — a card
 * showing "—" still occupies the place where a figure goes, and eyes fill that
 * in.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

document.addEventListener('admin:ready', init);

function init() {
  const form = document.querySelector('[data-pnl-filters]');
  if (!form) return;

  const params = new URLSearchParams(location.search);
  // Default to this month — the period somebody opening a P&L almost always
  // wants, and a default beats an empty form that does nothing until filled.
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  form.from.value = params.get('from') || iso(first);
  form.to.value = params.get('to') || iso(now);

  form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  load();
}

async function load() {
  const form = document.querySelector('[data-pnl-filters]');
  const qs = new URLSearchParams({ from: form.from.value, to: form.to.value });
  history.replaceState(null, '', `?${qs}`);

  let data;
  try {
    ({ data } = await adminFetch(`/accounting/profit-and-loss?${qs}`));
  } catch (err) {
    return fail(err.status === 404 || !err.status
      ? 'No backend connected yet — this report fills in once the API is live.'
      : err.message);
  }

  paint(data);
}

function paint(d) {
  document.querySelector('[data-pnl-period]').textContent =
    `${when(d.from)} to ${when(d.to)}`;

  const caveat = document.querySelector('[data-pnl-caveat]');
  if (d.caveat) {
    caveat.hidden = false;
    document.querySelector('[data-pnl-caveat-text]').textContent = d.caveat;
  } else {
    caveat.hidden = true;
  }

  rows('[data-pnl-income]', d.income, d.incomeTaka, 'Total income');
  rows('[data-pnl-expenses]', d.expenses, d.expensesTaka, 'Total expenses');

  const cards = [];

  // Only drawn when it is real. A greyed-out "Gross profit —" still puts a
  // gross-profit shaped hole on the screen, and people fill holes in.
  if (d.costOfGoodsKnown && d.grossProfitTaka !== null) {
    cards.push([money(d.grossProfitTaka), 'Gross profit']);
  }

  cards.push([
    money(d.netTaka),
    // Named for what it actually is. Calling it "profit" while cost of goods
    // is missing would be the exact error this whole module is built to avoid.
    d.costOfGoodsKnown ? 'Net profit' : 'Income less recorded expenses',
  ]);

  document.querySelector('[data-pnl-result]').innerHTML = cards.map(([n, l]) => `
    <div class="acard"><span class="acard__n">${n}</span><span class="acard__l">${escapeHtml(l)}</span></div>`).join('');
}

function rows(selector, list, total, totalLabel) {
  const host = document.querySelector(selector);
  if (!list.length) {
    host.innerHTML = '<div class="atotals__row"><dt class="atable__sub">Nothing recorded in this period.</dt><dd></dd></div>';
    return;
  }

  host.innerHTML = list.map((r) => `
      <div class="atotals__row">
        <dt>${escapeHtml(r.name)}</dt><dd>${money(r.amountTaka)}</dd>
      </div>`).join('')
    + `<div class="atotals__row is-total"><dt>${escapeHtml(totalLabel)}</dt><dd>${money(total)}</dd></div>`;
}

function fail(message) {
  const el = document.querySelector('[data-pnl-error]');
  el.textContent = message;
  el.hidden = false;
}

const money = (n) => `৳ ${Number(n).toLocaleString('en-BD')}`;
const iso = (d) => d.toISOString().slice(0, 10);
const when = (s) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
