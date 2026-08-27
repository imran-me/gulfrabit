/**
 * product-edit-page.js — edit one product.
 *
 * Only sends fields that actually changed. A PATCH that resends every value
 * would write a price-history row every time somebody opened the form and hit
 * save, which would bury the real changes among the noise.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { canDelete, confirmDelete } from './admin-delete.js';

let product = null;
let categories = [];

/**
 * The pack sizes as the form currently has them, in the same taka shape the
 * API returns: [{ label, amount, price, originalPrice, inStock }]. Kept as
 * state rather than read back out of the DOM because rows are added and
 * removed, and rebuilding an array from inputs that may be mid-edit is how a
 * half-typed price becomes a saved zero.
 */
let variantRows = [];

/**
 * The tag strings the storefront rails filter on, in the order they are kept
 * in the column. Checkboxes on this page are the only writers, so the
 * vocabulary cannot drift again ("best-seller" with a hyphen was a silent
 * no-op — the rail tag has none).
 */
const PLACEMENT_TAGS = ['featured', 'premium', 'bestseller', 'new'];

/** The media module, or null if it is not installed. See categories-page.js. */
let media = null;

document.addEventListener('admin:ready', load);

const sku = () => new URLSearchParams(location.search).get('sku');

async function load() {
  // Before anything can fail: the form has a type=submit button and fifteen
  // text inputs, and without this a Save click (or Enter in any field) on the
  // no-backend error state performed a NATIVE GET submit — full reload with
  // every field as a query param, destroying the ?sku= the page needs. The
  // real save handler is added later and does its own preventDefault; two
  // listeners are fine, the first one only vetoes the browser default.
  document.querySelector('[data-pe-form]')?.addEventListener('submit', (e) => e.preventDefault());

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

  // Delegated to the form, so the arrival panel re-reads itself whichever
  // of the three controls moved.
  document.querySelector('[data-pe-form]')
    ?.addEventListener('input', (e) => {
      if (e.target.closest('[data-pe-arrival]')) paintArrival(e.currentTarget);
    });
  const del = document.querySelector('[data-pe-delete]');
  if (del) {
    // Owner-only, and hidden rather than disabled: a control that refuses
    // the person looking at it is only a source of confusion. The route
    // behind it carries the real check.
    del.hidden = !canDelete('products');
    del.addEventListener('click', unlist);
  }
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
  f.description.value = product.description ?? '';
  f.priceTaka.value = product.price ?? '';
  f.originalPriceTaka.value = product.originalPrice ?? '';
  // Empty means unknown. Not zero — see the note next to the field.
  f.costTaka.value = product.costTaka ?? '';
  f.unit.value = product.unit ?? '';
  // Empty is a real state here too: no number means the product page shows no
  // scarcity line at all, which is different from showing "Only 0 left".
  f.stockDisplay.value = product.stockDisplay ?? '';
  f.inStock.checked = !!product.inStock;
  f.isActive.checked = !!product.isActive;

  // Arrival. The date is the feature; the other two are only meaningful
  // alongside it, which is what paintArrival() enforces on screen.
  f.availableFrom.value = product.availableFrom ?? '';
  f.preorderEnabled.checked = !!product.preorderEnabled;
  f.preorderLimit.value = product.preorderLimit ?? '';
  paintArrival(f);

  // Placement: the four rail tags become checkboxes; anything else the
  // product carries is a merchant's own label and goes to the "other tags"
  // box. Comma-joined for editing; split back apart on save.
  const tags = product.tags ?? [];
  f.placeFeatured.checked = tags.includes('featured');
  f.placePremium.checked = tags.includes('premium');
  f.placeBestseller.checked = tags.includes('bestseller');
  f.placeNew.checked = tags.includes('new');
  f.tags.value = tags.filter((t) => !PLACEMENT_TAGS.includes(t)).join(', ');
  f.dietary.value = (product.dietary ?? []).join(', ');
  f.searchTerms.value = (product.searchTerms ?? []).join(', ');

  fillAdLink();
  paintPerformance();

  variantRows = (product.variants ?? []).map((v) => ({ ...v }));
  paintVariants();
  document.querySelector('[data-pe-var-add]')?.addEventListener('click', addVariant);

  fillCategories(f);
  fillPhotos();
}

/* ------------------------------------------------------------------ *
 * Pack sizes
 * ------------------------------------------------------------------ */

/**
 * The Performance panel: what this product has done, in five figures.
 *
 * Delivered and open are kept apart deliberately. Adding them together is how
 * a shop talks itself into a reorder it cannot afford — open orders in a COD
 * market are demand that can still evaporate at the door, and this one has a
 * returned figure precisely so that evaporation is visible.
 *
 * The return RATE is spelled out rather than left as two numbers to divide,
 * because it is the one figure here that changes a decision: a product
 * selling well with a fifth of it coming back is not selling well.
 *
 * Hidden entirely until something has been ordered — a wall of zeroes on a
 * product added this morning is noise pretending to be information.
 */
function paintPerformance() {
  const host = document.querySelector('[data-pe-perf]');
  const p = product?.performance;
  if (!host || !p) return;

  const settled = p.unitsDelivered + p.unitsReturned;
  const returnRate = settled > 0 ? Math.round((p.unitsReturned / settled) * 100) : null;

  if (!p.orders) {
    host.hidden = true;
    return;
  }

  const tiles = [
    ['Delivered', `${p.unitsDelivered}`, 'units that reached a customer'],
    ['Revenue', `৳ ${p.revenueTaka.toLocaleString('en-BD')}`, 'from delivered orders only'],
    ['In flight', `${p.unitsOpen}`, 'placed but not yet delivered'],
    ['Returned', `${p.unitsReturned}`, returnRate === null ? 'none settled yet' : `${returnRate}% of settled`],
    ['Cancelled', `${p.unitsCancelled}`, 'incl. orders marked spam'],
  ];

  document.querySelector('[data-pe-perf-tiles]').innerHTML = tiles.map(([label, value, sub]) => `
    <div class="apstat">
      <span class="apstat__l">${escapeHtml(label)}</span>
      <span class="apstat__n">${escapeHtml(value)}</span>
      <span class="apstat__s">${escapeHtml(sub)}</span>
    </div>`).join('');

  const foot = document.querySelector('[data-pe-perf-foot]');
  foot.textContent = `Across ${p.orders} order${p.orders === 1 ? '' : 's'}`
    + (p.lastOrderedAt ? ` · last ordered ${when(p.lastOrderedAt)}` : '');

  host.hidden = false;
}

function paintVariants() {
  const host = document.querySelector('[data-pe-variants]');
  if (!host) return;

  host.innerHTML = '';

  variantRows.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'avariant';
    row.innerHTML = `
      <label class="avariant__f avariant__f--label"><span>Label</span>
        <input class="input-gr" type="text" maxlength="96" placeholder="500 g" data-vf="label"></label>
      <label class="avariant__f"><span>Size</span>
        <input class="input-gr" type="number" step="any" min="0" placeholder="0.5" data-vf="amount" value="${v.amount ?? ''}"></label>
      <label class="avariant__f"><span>Price ৳</span>
        <input class="input-gr" type="number" step="0.01" min="0.01" placeholder="0.00" data-vf="price" value="${v.price ?? ''}"></label>
      <label class="avariant__f"><span>“Was” ৳</span>
        <input class="input-gr" type="number" step="0.01" min="0" placeholder="—" data-vf="originalPrice" value="${v.originalPrice ?? ''}"></label>
      <label class="avariant__f avariant__f--own"><span>We have</span>
        <input class="input-gr" type="number" step="1" min="0" max="999999" placeholder="—" data-vf="stockQty" value="${v.stockQty ?? ''}"></label>
      <label class="avariant__f"><span>Show “N left”</span>
        <input class="input-gr" type="number" step="1" min="0" max="9999" placeholder="—" data-vf="stockDisplay" value="${v.stockDisplay ?? ''}"></label>
      <div class="avariant__foot">
        <label class="avariant__stock"><input type="checkbox" data-vf="inStock"${v.inStock === false ? '' : ' checked'}> in stock</label>
        <span class="avariant__sold" data-vsold></span>
        <button class="avariant__del" type="button">✕ Remove</button>
      </div>`;

    // By property, not by attribute interpolation: escapeHtml() does not
    // escape double quotes, and a label is free text. The numeric inputs
    // above are safe as-is — a number cannot carry a quote.
    row.querySelector('[data-vf="label"]').value = v.label ?? '';

    row.querySelectorAll('[data-vf]').forEach((input) => {
      input.addEventListener('input', () => {
        const k = input.dataset.vf;
        if (k === 'inStock') variantRows[i].inStock = input.checked;
        else if (k === 'label') variantRows[i].label = input.value;
        else variantRows[i][k] = input.value === '' ? null : Number(input.value);
        if (k === 'label') refreshDefaultVariant();
      });
    });
    // How this exact pack has actually sold. Sits in the row it describes,
    // because "which size do people buy" is the question a pack list is
    // silently asking, and answering it two panels away means nobody looks.
    const stats = product?.performance?.byVariant?.[v.label ?? ''] ?? null;
    const soldEl = row.querySelector('[data-vsold]');
    if (stats && soldEl) {
      const bits = [];
      if (stats.delivered) bits.push(`${stats.delivered} sold`);
      if (stats.open) bits.push(`${stats.open} in flight`);
      if (stats.returned) bits.push(`${stats.returned} returned`);
      if (stats.cancelled) bits.push(`${stats.cancelled} cancelled`);
      soldEl.textContent = bits.join(' · ');
    }

    row.querySelector('.avariant__del').addEventListener('click', () => {
      variantRows.splice(i, 1);
      paintVariants();
    });

    host.append(row);
  });

  refreshDefaultVariant();
}

function addVariant() {
  variantRows.push({ label: '', amount: null, price: null, originalPrice: null, inStock: true, stockQty: null });
  paintVariants();
  // Straight into the new row's label — the reason the button was pressed.
  const labels = document.querySelectorAll('[data-pe-variants] [data-vf="label"]');
  labels[labels.length - 1]?.focus();
}

/**
 * The URL to paste into a Facebook ad for this product: the one-page express
 * checkout, with UTMs so the order records which ad sold it. Origin comes from
 * the page so a staging panel hands out staging links, not production ones.
 */
/**
 * The arrival panel, explaining itself.
 *
 * Three inputs that produce four different shop behaviours is exactly the kind
 * of form where a merchant guesses wrong and finds out from a customer. So the
 * panel says the consequence in a sentence, and hides the controls that do not
 * apply yet rather than leaving them enabled and inert.
 *
 * The date decides everything. A past date is treated as "already here",
 * matching Product::isUpcoming() on the server — the same rule in the same
 * words, so the screen and the shop cannot disagree.
 */
function paintArrival(f) {
  const raw = f.availableFrom.value;
  const says = document.querySelector('[data-pe-arrival-says]');
  const preorderRow = document.querySelector('[data-pe-preorder-row]');
  const limitRow = document.querySelector('[data-pe-limit-row]');

  // Compared as dates, not timestamps: an arrival of "today" has landed, and
  // comparing against the current clock would keep it upcoming until midnight.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const arrives = raw ? new Date(`${raw}T00:00:00`) : null;
  const upcoming = arrives !== null && arrives > today;

  preorderRow.hidden = !upcoming;
  limitRow.hidden = !upcoming || !f.preorderEnabled.checked;

  if (!upcoming) {
    // Kept in step with the server, which clears both when the date goes: a
    // ticked box left behind a cleared date is a booby trap for the day
    // somebody sets a new one.
    f.preorderEnabled.checked = false;
    says.textContent = raw
      ? 'This arrived already, so it behaves like any other product — its stock switch decides whether it can be bought.'
      : 'On sale now, like the rest of the catalogue.';
    return;
  }

  const when = arrives.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  if (!f.preorderEnabled.checked) {
    says.textContent = `Shown in its category as Coming soon, arriving ${when}. `
      + 'Customers can ask to be told when it lands, but cannot order it. '
      + `On the morning of ${when} it goes on sale by itself.`;
    return;
  }

  const cap = Number(f.preorderLimit.value) || 0;
  says.textContent = `Customers can pre-order it now and it ships on ${when}. `
    + (cap > 0 ? `Stops after ${cap}. ` : 'No limit on how many. ')
    + 'Pre-orders must be paid in advance — cash on delivery is not offered on them.';
}

function fillAdLink() {
  const input = document.querySelector('[data-pe-adlink]');
  const btn = document.querySelector('[data-pe-adcopy]');
  if (!input) return;

  const url = new URL('/buy', location.origin);
  url.searchParams.set('sku', product.id);
  url.searchParams.set('utm_source', 'facebook');
  url.searchParams.set('utm_medium', 'paid');
  url.searchParams.set('utm_content', product.id);
  input.value = url.toString();

  btn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    } catch {
      // Clipboard needs a secure context; selecting the text still lets
      // the merchant copy by hand.
      input.select();
    }
  });
}

function refreshDefaultVariant() {
  const wrap = document.querySelector('[data-pe-defwrap]');
  const select = document.querySelector('[data-pe-defvar]');
  if (!wrap || !select) return;

  const labels = variantRows.map((v) => (v.label ?? '').trim()).filter(Boolean);
  // One pack needs no chooser — hidden, same reasoning as the sub-category box.
  wrap.hidden = labels.length < 2;

  const current = select.value || product.defaultVariant || '';
  // new Option(text, value) sets both by property — no attribute quoting to
  // get wrong, since a label is free text and escapeHtml leaves quotes alone.
  select.innerHTML = '';
  labels.forEach((l) => select.append(new Option(l, l)));
  select.value = labels.includes(current) ? current : (labels[0] ?? '');
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
    description: product.description ?? '',
    unit: product.unit ?? '',
  };
  for (const [key, was] of Object.entries(textFields)) {
    if (f[key].value.trim() !== String(was)) body[key] = f[key].value.trim();
  }

  // The comma-separated lists.
  const listFields = {
    dietary: product.dietary ?? [],
    searchTerms: product.searchTerms ?? [],
  };
  for (const [key, was] of Object.entries(listFields)) {
    const now = f[key].value.split(',').map((s) => s.trim()).filter(Boolean);
    if (JSON.stringify(now) !== JSON.stringify(was)) body[key] = now;
  }

  // Tags = placement checkboxes + the merchant's own labels. Compared as
  // SETS: no storefront reader cares about tag order (the rails filter on
  // membership), so splitting one field into five controls must not create a
  // phantom "changed" just because the pieces reassemble in a new order.
  {
    const boxes = { featured: f.placeFeatured, premium: f.placePremium, bestseller: f.placeBestseller, new: f.placeNew };
    const placements = PLACEMENT_TAGS.filter((t) => boxes[t].checked);
    const extras = f.tags.value.split(',').map((s) => s.trim()).filter(Boolean)
      // A placement typed into the free box would duplicate a checkbox and
      // make the set depend on which control you believe — checkboxes win.
      .filter((t) => !PLACEMENT_TAGS.includes(t));
    const now = [...placements, ...extras];
    const was = product.tags ?? [];
    if (JSON.stringify([...now].sort()) !== JSON.stringify([...was].sort())) body.tags = now;
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

  /* Arrival. Sent as a group whenever any of the three moved, because the
     server clears the pre-order flag and the limit when the date goes — and it
     can only do that if it is told the date changed in the same request. */
  {
    const date = f.availableFrom.value || null;
    const wasDate = product.availableFrom || null;
    const limitRaw = f.preorderLimit.value.trim();
    const limit = limitRaw === '' ? null : Number(limitRaw);
    const wasLimit = product.preorderLimit == null ? null : Number(product.preorderLimit);

    if (date !== wasDate) body.availableFrom = date;
    if (f.preorderEnabled.checked !== !!product.preorderEnabled) {
      body.preorderEnabled = f.preorderEnabled.checked;
    }
    if (limit !== wasLimit) body.preorderLimit = limit;
  }

  // The public "Only N left" figure. Same empty-is-null rule as the money
  // fields above, and for the same reason: clearing the box means "say nothing
  // about how many are left", which is not the claim "there are zero".
  {
    const raw = f.stockDisplay.value.trim();
    const now = raw === '' ? null : Number(raw);
    const before = product.stockDisplay == null ? null : Number(product.stockDisplay);
    if (now !== before) body.stockDisplay = now;
  }

  // Guarded on the select actually having options: when the /categories fetch
  // fails, the select is empty and its value is "" — which is not the product
  // moving anywhere, it is the form not knowing. Without the guard, every
  // save on that degraded page carried category:"" and 422'd, blocking edits
  // that had nothing to do with categories.
  if (f.category && f.category.options.length > 0
      && f.category.value !== (product.categorySlug ?? '')) {
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

  // Pack sizes. Validated here because the rows are dynamic — the browser's
  // own required/min can't span "every row that exists right now".
  {
    const rows = variantRows
      .map((v) => ({ ...v, label: (v.label ?? '').trim() }))
      .filter((v) => v.label || v.price != null);   // a fully blank row is just noise, drop it

    for (const v of rows) {
      if (!v.label) { btn.disabled = false; return fail('Every pack size needs a label.'); }
      if (!(v.price > 0)) { btn.disabled = false; return fail(`Pack "${v.label}" needs a price above zero.`); }
    }

    // stockQty rides along in the comparison as well as the payload: editing
    // only a count is a real edit, and a diff that ignored it would drop the
    // change on the floor while the form claimed it saved.
    const shape = (v) => ({
      label: v.label,
      amount: v.amount ?? null,
      price: v.price,
      originalPrice: v.originalPrice ?? null,
      inStock: v.inStock !== false,
      stockQty: v.stockQty ?? null,
      stockDisplay: v.stockDisplay ?? null,
    });
    const before = (product.variants ?? []).map(shape);
    const now = rows.map(shape);

    if (JSON.stringify(now) !== JSON.stringify(before)) {
      // The server's field names: taka amounts are explicit about being taka.
      body.variants = now.map((v) => ({
        label: v.label,
        amount: v.amount,
        priceTaka: v.price,
        originalPriceTaka: v.originalPrice,
        inStock: v.inStock,
        stockQty: v.stockQty,
        stockDisplay: v.stockDisplay,
      }));

      // A renamed label orphans the claim past order lines have on it. Warn,
      // don't block — corrections ("500g" → "500 g") are the common case.
      const lost = before.filter((b) => b.label && !now.some((n) => n.label === b.label));
      if (lost.length && !confirm(
        `These pack sizes are being removed or renamed:\n\n  ${lost.map((v) => v.label).join(', ')}\n\n`
        + 'Past orders that name them keep their records, but customers can no longer buy them. Continue?'
      )) { btn.disabled = false; return; }
    }

    const defSel = document.querySelector('[data-pe-defvar]');
    const defNow = now.length >= 2 ? (defSel?.value || null) : null;
    if (defNow !== (product.defaultVariant ?? null)) body.defaultVariant = defNow;
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

  const ok = await confirmDelete({
    title: `Remove "${product.title}" from the shop?`,
    body: 'It disappears from the site and from search. Orders that already contain it are not affected.',
  });
  if (!ok) return;

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
  setTimeout(() => location.assign('/admin/products'), 900);
}

function note(message) {
  const el = document.querySelector('[data-pe-saved]');
  el.textContent = message;
  el.hidden = false;
}

/**
 * Why a save was refused — brought to the person who pressed Save.
 *
 * This used to unhide the message and stop. The Save button is at the foot of
 * the details column and this slot is thirty-odd lines of markup further down,
 * past the pricing card and the danger zone — which on a phone is well past
 * the bottom of the screen. So pressing Save appeared to do nothing at all,
 * and the reason it had not saved was somewhere below, unread. That is how
 * "The tags field must not have more than 12 items." went unseen.
 *
 * role="alert" on the element already announced it to a screen reader; this is
 * the same courtesy for everyone else. tabindex -1 so focus can land on a
 * paragraph, and focus rather than scroll alone because it also puts the
 * keyboard back at the message instead of at a button that did nothing.
 */
function fail(message) {
  const el = document.querySelector('[data-pe-error]');
  el.textContent = message;
  el.hidden = false;

  el.tabIndex = -1;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}

function when(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
