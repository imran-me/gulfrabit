/**
 * product-edit-page.js — edit one product.
 *
 * Only sends fields that actually changed. A PATCH that resends every value
 * would write a price-history row every time somebody opened the form and hit
 * save, which would bury the real changes among the noise.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';

let product = null;

document.addEventListener('admin:ready', load);

const sku = () => new URLSearchParams(location.search).get('sku');

async function load() {
  if (!sku()) return fail('No SKU in the URL.');

  try {
    ({ data: product } = await adminFetch(`/products/${encodeURIComponent(sku())}`));
  } catch (err) {
    return fail(err.status === 404 || !err.status
      ? 'No backend connected yet — this screen fills in once the API is live.'
      : err.message);
  }

  fill();
  paintHistory();
  document.querySelector('[data-pe-form]').addEventListener('submit', save);
}

function fill() {
  const f = document.querySelector('[data-pe-form]');

  document.querySelector('[data-pe-title]').textContent = product.title;
  document.querySelector('[data-pe-meta]').textContent = product.marginPct == null
    // Says why, not just that it is missing.
    ? `${product.id} · margin unavailable until a unit cost is recorded`
    : `${product.id} · ${product.marginPct}% margin`;
  document.title = `${product.title} — GulfRabit Admin`;

  f.title.value = product.title ?? '';
  f.brand.value = product.brand ?? '';
  f.shortDescription.value = product.shortDescription ?? '';
  f.priceTaka.value = product.price ?? '';
  f.originalPriceTaka.value = product.originalPrice ?? '';
  // Empty means unknown. Not zero — see the note next to the field.
  f.costTaka.value = product.costTaka ?? '';
  f.inStock.checked = !!product.inStock;
  f.isActive.checked = !!product.isActive;
}

function paintHistory() {
  const host = document.querySelector('[data-pe-history]');
  if (!product.priceHistory?.length) {
    host.innerHTML = '<li class="atable__sub">No recorded price or cost changes.</li>';
    return;
  }

  host.innerHTML = product.priceHistory.map((h) => `
    <li class="arefund">
      <div>
        <strong>${escapeHtml(h.field.replace('_', ' '))}</strong>
        ${h.from == null ? 'set' : `৳ ${Number(h.from).toLocaleString('en-BD')}`}
        →
        ${h.to == null ? 'cleared' : `৳ ${Number(h.to).toLocaleString('en-BD')}`}
      </div>
      <div class="atable__sub">${escapeHtml(h.actor)} · ${when(h.at)}</div>
      ${h.reason ? `<div class="atable__sub">${escapeHtml(h.reason)}</div>` : ''}
    </li>`).join('');
}

async function save(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const btn = f.querySelector('button[type="submit"]');
  btn.disabled = true;

  // Build a patch of differences only.
  const body = {};
  const textFields = {
    title: product.title ?? '',
    brand: product.brand ?? '',
    shortDescription: product.shortDescription ?? '',
  };
  for (const [key, was] of Object.entries(textFields)) {
    if (f[key].value.trim() !== String(was)) body[key] = f[key].value.trim();
  }

  const money = {
    priceTaka: product.price,
    originalPriceTaka: product.originalPrice,
    costTaka: product.costTaka,
  };
  for (const [key, was] of Object.entries(money)) {
    const raw = f[key].value.trim();
    // An empty box is null (unknown), not 0 — the distinction the whole cost
    // column exists to preserve.
    const now = raw === '' ? null : Number(raw);
    const before = was == null ? null : Number(was);
    if (now !== before) body[key] = now;
  }

  if (f.inStock.checked !== !!product.inStock) body.inStock = f.inStock.checked;
  if (f.isActive.checked !== !!product.isActive) body.isActive = f.isActive.checked;
  if (f.reason.value.trim()) body.reason = f.reason.value.trim();

  if (Object.keys(body).length === 0) {
    btn.disabled = false;
    return note('Nothing changed.');
  }

  let result;
  try {
    result = await adminFetch(`/products/${encodeURIComponent(sku())}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    btn.disabled = false;
    return fail(err.message);
  }

  btn.disabled = false;
  note(result.message);
  // Reload so the price history and margin reflect what was just saved,
  // rather than the browser guessing at both.
  setTimeout(() => location.reload(), 700);
}

function note(message) {
  const el = document.querySelector('[data-pe-saved]');
  el.textContent = message;
  el.hidden = false;
}

function fail(message) {
  const el = document.querySelector('[data-pe-error]');
  el.textContent = message;
  el.hidden = false;
}

function when(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
