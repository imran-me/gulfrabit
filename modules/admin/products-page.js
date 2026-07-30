/**
 * products-page.js — the catalogue list.
 *
 * Leads with the missing-cost count. Without cost there is no margin and no
 * profit figure, and the fastest way to turn that from a vague blocker into
 * work somebody can finish is to put a number on it at the top of the screen.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';

let page = 1;
let categories = [];

/** The media module, or null if it is not installed. See categories-page.js. */
let media = null;

document.addEventListener('admin:ready', init);

async function init() {
  const form = document.querySelector('[data-prod-filters]');
  if (!form) return;

  media = await import('/modules/media/media-picker.js').catch(() => null);
  setupCreate();

  const params = new URLSearchParams(location.search);
  ['q', 'noCost'].forEach((k) => { if (params.has(k) && form[k]) form[k].value = params.get(k); });
  page = Math.max(1, Number(params.get('page')) || 1);

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  document.querySelector('[data-prod-clear]')?.addEventListener('click', () => { form.reset(); page = 1; load(); });
  document.querySelector('[data-cost-gap-filter]')?.addEventListener('click', () => {
    form.noCost.value = '1';
    page = 1;
    load();
  });
  document.querySelector('[data-ppage-prev]')?.addEventListener('click', () => { page--; load(); });
  document.querySelector('[data-ppage-next]')?.addEventListener('click', () => { page++; load(); });

  load();
}

/* ------------------------------------------------------------------ *
 * Creating a product
 * ------------------------------------------------------------------ */

async function setupCreate() {
  const form = document.querySelector('[data-prod-form]');
  if (!form) return;

  document.querySelector('[data-prod-new]')?.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) {
      form.title.focus();
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  document.querySelector('[data-prod-cancel]')?.addEventListener('click', () => {
    form.hidden = true;
    form.reset();
  });

  form.addEventListener('submit', create);

  if (media) {
    media.mountGalleryFields(form);
  } else {
    // The API requires at least one photo, so without the media module there
    // is no way to complete this form. Better to say that than to let someone
    // fill it in and be refused on submit.
    const photos = form.querySelector('[data-prod-photos]');
    if (photos) {
      photos.innerHTML = '<p class="admin__sub" style="margin:0">'
        + 'Photos need the media module, which is not installed.</p>';
    }
    form.querySelector('button[type="submit"]').disabled = true;
  }

  try {
    ({ data: categories } = await adminFetch('/categories'));
  } catch {
    return;      // the selects stay empty; the list below still works
  }

  const cats = form.querySelector('[data-prod-cats]');
  const tops = categories.filter((c) => !c.parent);

  // Switched-off categories are offered, and labelled. Building a product into
  // a category you have not launched yet is a normal thing to do — it is the
  // reason new products are created unlisted.
  cats.innerHTML = tops.map((c) =>
    `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}${
      c.isActive ? '' : ' (switched off)'}</option>`).join('');

  cats.addEventListener('change', () => fillSubs(form));
  fillSubs(form);
}

function fillSubs(form) {
  const wrap = form.querySelector('[data-prod-subwrap]');
  const subs = form.querySelector('[data-prod-subs]');
  const kids = categories.filter((c) => c.parent === form.category.value);

  wrap.hidden = kids.length === 0;
  subs.innerHTML = '<option value="">None</option>' + kids.map((c) =>
    `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
}

async function create(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');

  const images = form.images ? JSON.parse(form.images.value || '[]') : [];

  if (!images.length) {
    return problem('Add at least one photo — it becomes the product\'s main image.');
  }

  btn.disabled = true;

  const was = form.originalPriceTaka.value.trim();

  let result;
  try {
    result = await adminFetch('/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.value.trim(),
        category: form.category.value,
        subCategory: form.subCategory && !form.querySelector('[data-prod-subwrap]').hidden
          ? form.subCategory.value || null
          : null,
        priceTaka: Number(form.priceTaka.value),
        originalPriceTaka: was === '' ? null : Number(was),
        images,
      }),
    });
  } catch (err) {
    btn.disabled = false;
    return problem(err.message);
  }

  // Straight to the edit screen. The create form asked for four fields; brand,
  // origin, barcode, cost and the description are the rest of the job, and
  // dropping the merchant back onto a list means most of them never get filled.
  location.assign(`/modules/admin/product-edit.html?sku=${encodeURIComponent(result.data.id)}`);
}

function problem(message) {
  const el = document.querySelector('[data-prod-error]');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ------------------------------------------------------------------ */

async function load() {
  const body = document.querySelector('[data-prod-body]');
  const form = document.querySelector('[data-prod-filters]');

  const qs = new URLSearchParams();
  ['q', 'noCost'].forEach((k) => {
    const v = form[k]?.value.trim();
    if (v) qs.set(k, v);
  });
  if (page > 1) qs.set('page', String(page));
  history.replaceState(null, '', qs.toString() ? `?${qs}` : location.pathname);

  body.innerHTML = '<tr><td colspan="6" class="atable__empty">Loading…</td></tr>';

  let payload;
  try {
    payload = await adminFetch(`/products?${qs}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — products appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    document.querySelector('[data-prod-count]').textContent = '';
    return;
  }

  paint(payload);
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-prod-body]');
  document.querySelector('[data-prod-count]').textContent =
    `${meta.total.toLocaleString('en-BD')} product${meta.total === 1 ? '' : 's'}`;

  const gap = document.querySelector('[data-cost-gap]');
  if (meta.missingCost > 0) {
    gap.hidden = false;
    document.querySelector('[data-cost-gap-n]').textContent = meta.missingCost;
  } else {
    gap.hidden = true;
  }

  if (!data.length) {
    body.innerHTML = '<tr><td colspan="6" class="atable__empty">Nothing matches these filters.</td></tr>';
    document.querySelector('[data-prod-pager]').hidden = true;
    return;
  }

  body.innerHTML = data.map((p) => `
    <tr>
      <td>
        <a href="/modules/admin/product-edit.html?sku=${encodeURIComponent(p.sku)}">${escapeHtml(p.title)}</a>
        <div class="atable__sub">${escapeHtml(p.sku)}${p.brand ? ` · ${escapeHtml(p.brand)}` : ''}</div>
      </td>
      <td class="atable__sub">${escapeHtml(p.category || '—')}</td>
      <td class="atable__num">৳ ${Number(p.priceTaka).toLocaleString('en-BD')}</td>
      <td class="atable__num">${
        // "Not recorded" rather than a dash or a zero. The distinction is the
        // whole reason the column is nullable.
        p.costTaka == null
          ? '<span class="atable__sub">not recorded</span>'
          : `৳ ${Number(p.costTaka).toLocaleString('en-BD')}`
      }</td>
      <td class="atable__num">${p.marginPct == null ? '<span class="atable__sub">—</span>' : `${p.marginPct}%`}</td>
      <td>${status(p)}</td>
    </tr>`).join('');

  const pager = document.querySelector('[data-prod-pager]');
  pager.hidden = meta.lastPage <= 1;
  document.querySelector('[data-ppage-label]').textContent = `Page ${meta.currentPage} of ${meta.lastPage}`;
  document.querySelector('[data-ppage-prev]').disabled = meta.currentPage <= 1;
  document.querySelector('[data-ppage-next]').disabled = meta.currentPage >= meta.lastPage;
}

function status(p) {
  if (!p.isActive) return '<span class="apill apill--wait">Unlisted</span>';
  return p.inStock
    ? '<span class="apill apill--ok">In stock</span>'
    : '<span class="apill apill--bad">Out of stock</span>';
}
