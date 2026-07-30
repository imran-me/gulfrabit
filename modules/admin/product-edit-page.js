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
let categories = [];

/** The media module, or null if it is not installed. See categories-page.js. */
let media = null;

document.addEventListener('admin:ready', load);

const sku = () => new URLSearchParams(location.search).get('sku');

async function load() {
  if (!sku()) return fail('No SKU in the URL.');

  media = await import('/modules/media/media-picker.js').catch(() => null);

  try {
    ({ data: product } = await adminFetch(`/products/${encodeURIComponent(sku())}`));
  } catch (err) {
    return fail(err.status === 404 || !err.status
      ? 'No backend connected yet — this screen fills in once the API is live.'
      : err.message);
  }

  // Not fatal. Without it the category selects stay empty and everything else
  // on the page still saves.
  try {
    ({ data: categories } = await adminFetch('/categories'));
  } catch {
    categories = [];
  }

  fill();
  paintHistory();
  document.querySelector('[data-pe-form]').addEventListener('submit', save);
  document.querySelector('[data-pe-delete]')?.addEventListener('click', unlist);
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

  fillCategories(f);
  fillPhotos();
}

/* ------------------------------------------------------------------ *
 * Category and sub-category
 * ------------------------------------------------------------------ */

function fillCategories(f) {
  const cats = f.querySelector('[data-pe-cats]');
  if (!cats) return;

  const tops = categories.filter((c) => !c.parent);

  cats.innerHTML = tops.map((c) =>
    `<option value="${escapeHtml(c.slug)}"${c.isActive ? '' : ' data-off="1"'}>${
      escapeHtml(c.name)}${c.isActive ? '' : ' (switched off)'}</option>`).join('');

  // The product's own category, even if it is switched off — otherwise the
  // select would silently show a different one and the next save would move
  // the product without anybody asking for it.
  cats.value = product.categorySlug ?? '';
  if (!cats.value && tops.length) cats.value = tops[0].slug;

  cats.addEventListener('change', () => fillSubs(f, ''));
  fillSubs(f, product.subSlug ?? '');
}

function fillSubs(f, selected) {
  const wrap = f.querySelector('[data-pe-subwrap]');
  const subs = f.querySelector('[data-pe-subs]');
  const parent = f.querySelector('[data-pe-cats]').value;

  const kids = categories.filter((c) => c.parent === parent);

  // Hidden rather than shown empty. An always-present select with one "None"
  // option reads as a field somebody forgot to fill in.
  wrap.hidden = kids.length === 0;

  subs.innerHTML = '<option value="">None</option>' + kids.map((c) =>
    `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');

  subs.value = kids.some((c) => c.slug === selected) ? selected : '';
}

/* ------------------------------------------------------------------ *
 * Photos
 * ------------------------------------------------------------------ */

function fillPhotos() {
  const host = document.querySelector('[data-pe-photos]');
  if (!host) return;

  if (!media) {
    host.remove();   // nothing can edit them, so do not show a dead control
    return;
  }

  const field = host.querySelector('[data-media-gallery]');
  field.dataset.value = JSON.stringify(product.images ?? []);
  media.mountGalleryFields(host);
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

  if (f.category && f.category.value !== (product.categorySlug ?? '')) {
    body.category = f.category.value;
  }

  // Sent whenever the category moved, even if the sub-category box itself did
  // not change: the server clears sub_category_id on a category move unless
  // this field arrives, and staying silent would drop a sub-category the
  // merchant could still see selected.
  const subNow = f.subCategory && !f.querySelector('[data-pe-subwrap]').hidden
    ? f.subCategory.value
    : '';
  if (body.category !== undefined || subNow !== (product.subSlug ?? '')) {
    body.subCategory = subNow || null;
  }

  const gallery = f.images ? JSON.parse(f.images.value || '[]') : null;
  if (gallery && JSON.stringify(gallery) !== JSON.stringify(product.images ?? [])) {
    body.images = gallery;
  }

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

/**
 * Remove the product from the shop.
 *
 * The confirmation names the product and says what survives, because "are you
 * sure?" on its own gets clicked through. It is a soft delete server-side —
 * past orders keep their line — but the merchant does not know that unless the
 * dialog says so.
 */
async function unlist() {
  const btn = document.querySelector('[data-pe-delete]');

  if (!confirm(
    `Remove "${product.title}" from the shop?\n\n`
    + 'It disappears from the site and from search. Orders that already contain it '
    + 'are not affected, and nothing is erased — it can be restored.'
  )) return;

  btn.disabled = true;

  let result;
  try {
    result = await adminFetch(`/products/${encodeURIComponent(sku())}`, { method: 'DELETE' });
  } catch (err) {
    btn.disabled = false;
    return fail(err.message);
  }

  note(result.message);
  // Back to the list: this product's page no longer has anything to show, and
  // leaving it open invites an edit that would fail.
  setTimeout(() => location.assign('/modules/admin/products.html'), 900);
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
