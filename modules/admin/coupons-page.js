/**
 * coupons-page.js — coupons and offers.
 *
 * The list leads with STATE, not with the on/off switch. A coupon can be
 * switched on and still do nothing — it starts next week, it expired, it hit
 * its usage limit, or it is scoped to a set nobody filled in. Those are four
 * different problems that look identical next to a toggle, so the server names
 * which one it is and the card says so in words.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { canDelete, confirmDelete } from './admin-delete.js';

let coupons = [];
let categories = [];
let products = [];

document.addEventListener('admin:ready', init);

async function init() {
  if (!document.querySelector('[data-cp-list]')) return;

  const form = document.querySelector('[data-cp-form]');

  document.querySelector('[data-cp-new]')?.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) {
      form.code.focus();
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  document.querySelector('[data-cp-cancel]')?.addEventListener('click', () => {
    form.hidden = true;
    form.reset();
    onTypeChange();
    onScopeChange();
  });

  form.querySelector('[data-cp-type]').addEventListener('change', onTypeChange);
  form.querySelector('[data-cp-scope]').addEventListener('change', onScopeChange);
  form.addEventListener('submit', create);

  load();
}

async function load() {
  const host = document.querySelector('[data-cp-list]');

  try {
    ({ data: coupons } = await adminFetch('/promotions'));
  } catch (err) {
    /* The count line lives in the masthead and is only written by paint(),
       which a failed load never reaches — so the heading went on saying
       "Loading…" underneath a page that had already given up and said so.
       Two statements on one screen, contradicting each other, and the stale
       one on top. Every other list screen in the panel clears it here; these
       two were missed. */
    document.querySelector('[data-cp-count]').textContent = '';
    host.innerHTML = `<p class="admin__sub">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — coupons appear once the API is live.'
        : escapeHtml(err.message)
    }</p>`;
    return;
  }

  paint();
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

function paint() {
  /* Deleted codes arrive in the same payload — a shop has a handful of promo
     codes, not a paginated list — and are drawn in their own section below
     rather than behind a tab nobody would open. They are kept out of the count
     and out of "working right now", which is the number this screen exists to
     answer. */
  const shown = coupons.filter((c) => !c.deletedAt);
  const binned = coupons.filter((c) => c.deletedAt);
  const live = shown.filter((c) => c.state === 'live').length;

  document.querySelector('[data-cp-count]').textContent = shown.length
    ? `${shown.length} coupon${shown.length === 1 ? '' : 's'} · ${live} working right now`
    : 'No coupons yet';

  document.querySelector('[data-cp-list]').innerHTML = shown.length
    ? shown.map(card).join('')
    : '<p class="admin__sub">No coupons yet — create one to run an offer.</p>';

  const bin = document.querySelector('[data-cp-bin]');
  if (bin) {
    bin.hidden = !binned.length;
    bin.innerHTML = binned.length
      ? `<h2 class="h5">Deleted</h2>
         <p class="admin__sub" style="margin-top:0">
           Restoring brings the code back with the products or categories it was scoped to —
           still switched off, so nothing starts discounting by surprise.
         </p>
         <div class="acat-grid">${binned.map(card).join('')}</div>`
      : '';
  }

  document.querySelectorAll('[data-cp-toggle]').forEach((input) => {
    input.addEventListener('change', () => toggle(input));
  });
  document.querySelectorAll('[data-cp-del]').forEach((btn) => {
    btn.addEventListener('click', () => remove(btn.dataset.cpDel));
  });
  document.querySelectorAll('[data-cp-restore]').forEach((btn) => {
    btn.addEventListener('click', () => putBack(btn));
  });
}

const STATE_PILL = {
  live: 'apill--ok',
  off: '',
  scheduled: 'apill--info',
  expired: 'apill--wait',
  'used up': 'apill--wait',
  // Bad rather than merely waiting: this one is a misconfiguration, not a
  // date passing. The coupon is switched on and silently doing nothing.
  'no items chosen': 'apill--bad',
};

function card(c) {
  const amount = c.type === 'pct'
    ? `${c.value}% off`
    : `৳${Number(c.value).toLocaleString('en-BD')} off`;

  const applies = c.scope === 'all'
    ? 'everything'
    : `${c.targets.length} ${c.scope === 'products' ? 'product' : 'categor'}${
        c.scope === 'products'
          ? (c.targets.length === 1 ? '' : 's')
          : (c.targets.length === 1 ? 'y' : 'ies')}`;

  return `
    <article class="acat${c.state === 'live' ? '' : ' is-off'}${c.deletedAt ? ' is-deleted' : ''}"
             data-cp="${escapeHtml(c.code)}">
      <div class="acat__head">
        <div class="acat__ident">
          <h2 class="acat__name" style="font-family:monospace">${escapeHtml(c.code)}</h2>
          <span class="acat__slug">${escapeHtml(amount)} on ${escapeHtml(applies)}</span>
        </div>
        <span class="apill ${STATE_PILL[c.state] ?? ''}">${escapeHtml(c.state)}</span>
      </div>

      ${c.label ? `<p class="acat__blurb">${escapeHtml(c.label)}</p>` : ''}

      ${c.targets.length
        ? `<p class="acat__blurb atable__sub">${
            c.targets.slice(0, 4).map((t) => escapeHtml(t.name)).join(', ')
          }${c.targets.length > 4 ? ` and ${c.targets.length - 4} more` : ''}</p>`
        : ''}

      <div class="acat__counts">
        <div><strong>${c.usedCount}</strong> used${c.usageLimit ? ` of ${c.usageLimit}` : ''}</div>
        <div><strong>${c.minSpend ? `৳${c.minSpend}` : '—'}</strong> min spend</div>
        <div><strong>${c.maxDiscount ? `৳${c.maxDiscount}` : '—'}</strong> cap</div>
      </div>

      ${c.startsAt || c.endsAt
        ? `<p class="atable__sub" style="margin:0">${
            c.startsAt ? `from ${escapeHtml(c.startsAt)}` : 'no start date'} ·
            ${c.endsAt ? `until ${escapeHtml(c.endsAt)}` : 'no end date'}</p>`
        : ''}

      <div class="acat__switches">${
        // A deleted code has no switches. They would offer to publish a
        // discount that is not in any checkout, and toggling one would be a
        // change with no visible effect anywhere.
        c.deletedAt
          ? (canDelete()
              ? `<button type="button" class="btn-gr btn-outline-gr btn-sm-gr"
                         data-cp-restore="${escapeHtml(c.code)}">Restore</button>`
              : '<span class="atable__sub">Deleted</span>')
          : `<label class="aswitch">
               <input type="checkbox" data-cp-toggle="isActive" ${c.isActive ? 'checked' : ''}>
               <span class="aswitch__track"></span>
               <span>Active</span>
             </label>
             <label class="aswitch">
               <input type="checkbox" data-cp-toggle="isPublic" ${c.isPublic ? 'checked' : ''}
                      ${c.isActive ? '' : 'disabled'}>
               <span class="aswitch__track"></span>
               <span>Show on site</span>
             </label>
             ${
               // Drawn whatever the used count, so the server's refusal — "this
               // has been used 40 times, it is the only record of what that
               // campaign cost" — can be read. Hiding the button hid the reason
               // with it, and left the merchant wondering why one card has a
               // Delete and the next does not.
               canDelete()
                 ? `<button type="button" class="alink-btn alink-btn--danger acat__delete"
                            data-cp-del="${escapeHtml(c.code)}">Delete</button>`
                 : ''
             }`
      }</div>
    </article>`;
}

/* ------------------------------------------------------------------ *
 * The form
 * ------------------------------------------------------------------ */

function onTypeChange() {
  const form = document.querySelector('[data-cp-form]');
  const pct = form.type.value === 'pct';

  form.querySelector('[data-cp-value-label]').textContent = pct ? 'Percent off' : 'Amount off ৳';
  // 90 rather than 100: a code that makes an order free is nearly always a
  // typo, and the server caps it there too.
  form.value.max = pct ? 90 : 10000000;
  form.value.step = pct ? 1 : 1;
  form.value.placeholder = pct ? '10' : '500';
}

async function onScopeChange() {
  const form = document.querySelector('[data-cp-form]');
  const scope = form.scope.value;
  const wrap = form.querySelector('[data-cp-targets-wrap]');

  wrap.hidden = scope === 'all';
  if (scope === 'all') return;

  const host = form.querySelector('[data-cp-targets]');
  const hint = form.querySelector('[data-cp-targets-hint]');

  host.innerHTML = '<p class="admin__sub" style="margin:0">Loading…</p>';

  // Fetched on demand and cached. The product list can be long, and loading it
  // for every merchant who only ever makes basket-wide coupons is waste.
  try {
    if (scope === 'categories' && !categories.length) {
      ({ data: categories } = await adminFetch('/categories'));
    }
    if (scope === 'products' && !products.length) {
      ({ data: products } = await adminFetch('/products?perPage=100'));
    }
  } catch (err) {
    host.innerHTML = `<p class="admin__sub" style="margin:0">${escapeHtml(err.message)}</p>`;
    return;
  }

  // `sku`, not `id`: the ADMIN product list is its own shape (see
  // AdminProductController::index) and has no `id` field — the storefront one
  // does, which is where the wrong name came from. Reading the missing key
  // gave every checkbox value="", the empty strings arrived as nulls (Laravel
  // converts them), and the server refused the save with "The targets.0 field
  // must be a string" — so a product-scoped coupon could not be created at all.
  const rows = scope === 'categories'
    ? categories.map((c) => ({ key: c.slug, name: c.name, note: c.isActive ? '' : 'switched off' }))
    : products.map((p) => ({ key: p.sku, name: p.title, note: p.isActive ? '' : 'unlisted' }));

  // A row with no key cannot be targeted, and rendering it as a tickable box
  // offers a choice that silently does nothing. Drop it instead.
  const usable = rows.filter((r) => typeof r.key === 'string' && r.key !== '');

  hint.textContent = `— pick from ${usable.length}`;

  host.innerHTML = usable.map((r) => `
    <label class="cptarget">
      <input type="checkbox" value="${escapeHtml(r.key)}">
      <span>${escapeHtml(r.name)}${r.note ? ` <em>(${r.note})</em>` : ''}</span>
    </label>`).join('');
}

async function create(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');

  const scope = form.scope.value;
  const targets = scope === 'all'
    ? []
    : [...form.querySelectorAll('[data-cp-targets] input:checked')].map((i) => i.value);

  if (scope !== 'all' && targets.length === 0) {
    return note('Pick at least one item, or set it to apply to everything.', false);
  }

  btn.disabled = true;

  const num = (field) => {
    const raw = form[field].value.trim();
    return raw === '' ? null : Number(raw);
  };

  try {
    await adminFetch('/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.code.value.trim().toUpperCase(),
        label: form.label.value.trim() || null,
        type: form.type.value,
        value: Number(form.value.value),
        scope,
        targets,
        minSpend: num('minSpend'),
        maxDiscount: num('maxDiscount'),
        startsAt: form.startsAt.value || null,
        endsAt: form.endsAt.value || null,
        usageLimit: num('usageLimit'),
        isPublic: form.isPublic.checked,
      }),
    });
  } catch (err) {
    btn.disabled = false;
    return note(err.message, false);
  }

  btn.disabled = false;
  form.reset();
  onTypeChange();
  onScopeChange();
  form.hidden = true;
  await load();
  note('Coupon created and active.', true);
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

async function toggle(input) {
  const code = input.closest('[data-cp]').dataset.cp;
  const field = input.dataset.cpToggle;
  const value = input.checked;

  input.disabled = true;

  try {
    await adminFetch(`/promotions/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
  } catch (err) {
    input.checked = !value;
    input.disabled = false;
    return note(err.message, false);
  }

  input.disabled = false;

  // Reload rather than patch in place: switching Active changes the derived
  // state ("live" / "off" / "scheduled"), which only the server computes.
  await load();
  note(field === 'isActive'
    ? `${code} is ${value ? 'active' : 'switched off'}.`
    : `${code} is ${value ? 'now advertised on the site' : 'no longer shown on the site'}.`, true);
}

async function remove(code) {
  const c = coupons.find((x) => x.code === code);

  const ok = await confirmDelete({
    title: `Delete ${code}?`,
    // The used count decides whether this will be allowed at all, so it leads.
    body: c?.usedCount
      ? `It has been used ${c.usedCount} time${c.usedCount === 1 ? '' : 's'}, so the server will `
        + 'refuse — a used code is the only record of what that campaign cost. Switch it off instead.'
      : 'It has never been used. The code and the products or categories it applies to are kept.',
  });
  if (!ok) return;

  let message;
  try {
    ({ message } = await adminFetch(`/promotions/${encodeURIComponent(code)}`, { method: 'DELETE' }));
  } catch (err) {
    // The refusal sentence is the whole value of the click when a code has
    // been used, so it is shown rather than swallowed.
    return note(err.message, false);
  }

  await load();
  note(message || `${code} deleted.`, true);
}

/**
 * Put a deleted code back — off.
 *
 * destroy() switches it off on the way out precisely so this cannot hand back
 * a live discount: undoing a mistake should not start taking money off orders
 * the moment it is undone.
 */
async function putBack(btn) {
  const code = btn.dataset.cpRestore;
  btn.disabled = true;
  btn.textContent = 'Restoring…';

  let message;
  try {
    ({ message } = await adminFetch(
      `/promotions/${encodeURIComponent(code)}/restore`, { method: 'POST' }));
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Restore';
    return note(err.message, false);
  }

  await load();
  note(message || `${code} is back, still switched off.`, true);
}

function note(message, ok) {
  const el = document.querySelector('[data-cp-note]');
  el.textContent = message;
  el.hidden = false;
  el.style.background = ok ? 'rgba(46,160,67,.10)' : '';
  el.style.color = ok ? '#1a7f37' : '';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
