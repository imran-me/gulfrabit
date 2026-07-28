/**
 * journal-page.js — the ledger, and the expense form most days need.
 *
 * Read-only for entries. There is no edit control, because there is no edit
 * endpoint: a posted entry is corrected by reversing it, so that last quarter
 * still says today what it said then.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

let accounts = [];

document.addEventListener('admin:ready', init);

async function init() {
  if (!document.querySelector('[data-jr-body]')) return;

  await loadAccounts();
  document.querySelector('[data-expense-form]')?.addEventListener('submit', recordExpense);
  load();
}

async function loadAccounts() {
  try {
    ({ data: accounts } = await adminFetch('/accounting/accounts'));
  } catch {
    // The journal still lists without the expense form working, so a failure
    // here must not stop the page.
    accounts = [];
  }

  const expense = accounts.filter((a) => a.type === 'expense');
  // Money leaves from an asset, or is owed as a liability if it is on credit.
  const funding = accounts.filter((a) => a.type === 'asset' || a.type === 'liability');

  fill('[data-expense-form] [name="accountCode"]', expense);
  fill('[data-expense-form] [name="paidFrom"]', funding);
}

function fill(selector, list) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = list.length
    ? list.map((a) => `<option value="${escapeHtml(a.code)}">${escapeHtml(a.code)} — ${escapeHtml(a.name)}</option>`).join('')
    : '<option value="">No accounts available</option>';
}

async function load() {
  const body = document.querySelector('[data-jr-body]');

  let payload;
  try {
    payload = await adminFetch('/accounting/journal');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — the journal fills in once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    document.querySelector('[data-jr-count]').textContent = '';
    return;
  }

  paint(payload);
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-jr-body]');
  document.querySelector('[data-jr-count]').textContent =
    `${meta.total.toLocaleString('en-BD')} posted entr${meta.total === 1 ? 'y' : 'ies'}`;

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="6" class="atable__empty">Nothing posted yet.</td></tr>';
    return;
  }

  body.innerHTML = data.map((e) => `
    <tr>
      <td>${escapeHtml(e.reference)}${
        // Flagged, so a correction reads as a correction rather than as a
        // second unexplained transaction.
        e.reverses ? ' <span class="apill apill--info">reversal</span>' : ''
      }</td>
      <td class="atable__sub">${when(e.date)}</td>
      <td>${escapeHtml(e.memo)}</td>
      <td class="atable__sub">${e.lines.map((l) => escapeHtml(l.account || '')).join(' · ')}</td>
      <td class="atable__num">৳ ${Number(e.totalTaka).toLocaleString('en-BD')}</td>
      <td class="atable__sub">${escapeHtml(e.by)}</td>
    </tr>`).join('');
}

async function recordExpense(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    await adminFetch('/accounting/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountTaka: Number(form.amountTaka.value),
        accountCode: form.accountCode.value,
        paidFrom: form.paidFrom.value,
        description: form.description.value.trim(),
        date: form.date.value || undefined,
      }),
    });
  } catch (err) {
    btn.disabled = false;
    const el = document.querySelector('[data-jr-error]');
    el.textContent = err.message;
    el.hidden = false;
    return;
  }

  location.reload();
}

const when = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
