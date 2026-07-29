/**
 * categories-page.js — category management.
 *
 * Switches save immediately, with no Save button. A settings screen where you
 * flip something and then have to remember to confirm it is a screen where
 * people eventually don't, and then wonder why the shop didn't change.
 *
 * The trade is that a failed request must put the switch back, or the panel
 * would show a state the server never accepted. Hence the revert on error.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';

let categories = [];

document.addEventListener('admin:ready', init);

function init() {
  if (!document.querySelector('[data-cat-list]')) return;

  const form = document.querySelector('[data-cat-form]');
  document.querySelector('[data-cat-new]')?.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) form.name.focus();
  });
  document.querySelector('[data-cat-cancel]')?.addEventListener('click', () => {
    form.hidden = true;
    form.reset();
  });
  form?.addEventListener('submit', create);

  load();
}

async function load() {
  const host = document.querySelector('[data-cat-list]');

  try {
    ({ data: categories } = await adminFetch('/categories'));
  } catch (err) {
    host.innerHTML = `<p class="admin__sub">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — categories appear once the API is live.'
        : escapeHtml(err.message)
    }</p>`;
    return;
  }

  paint();
}

function paint() {
  const live = categories.filter((c) => c.isActive).length;
  document.querySelector('[data-cat-count]').textContent =
    `${categories.length} categories · ${live} live on the site`;

  document.querySelector('[data-cat-list]').innerHTML = categories.map(card).join('');
  wire();
}

function card(c) {
  return `
    <article class="acat${c.isActive ? '' : ' is-off'}" data-cat="${escapeHtml(c.slug)}">
      <div class="acat__head">
        <div>
          <h2 class="acat__name">${escapeHtml(c.name)}</h2>
          <span class="acat__slug">/${escapeHtml(c.slug)}</span>
        </div>
        ${c.audience === 'b2b' ? '<span class="apill apill--info">B2B</span>' : ''}
      </div>

      ${c.blurb ? `<p class="acat__blurb">${escapeHtml(c.blurb)}</p>` : ''}

      <div class="acat__counts">
        <div><strong>${c.products}</strong> products</div>
        <div><strong>${c.isActive ? c.liveProducts : 0}</strong> visible</div>
      </div>

      <div class="acat__switches">
        <label class="aswitch">
          <input type="checkbox" data-toggle="isActive" ${c.isActive ? 'checked' : ''}>
          <span class="aswitch__track"></span>
          <span>Live</span>
        </label>
        <label class="aswitch">
          <input type="checkbox" data-toggle="showInMenu" ${c.showInMenu ? 'checked' : ''}
                 ${c.isActive ? '' : 'disabled'}>
          <span class="aswitch__track"></span>
          <span>In menu</span>
        </label>
      </div>
    </article>`;
}

function wire() {
  document.querySelectorAll('[data-cat] [data-toggle]').forEach((input) => {
    input.addEventListener('change', () => toggle(input));
  });
}

async function toggle(input) {
  const slug = input.closest('[data-cat]').dataset.cat;
  const field = input.dataset.toggle;
  const value = input.checked;

  input.disabled = true;

  let result;
  try {
    result = await adminFetch(`/categories/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
  } catch (err) {
    // Put it back. Leaving it flipped would show a state the server refused,
    // and the merchant would believe the shop had changed when it had not.
    input.checked = !value;
    input.disabled = false;
    return fail(err.message);
  }

  input.disabled = false;

  const record = categories.find((c) => c.slug === slug);
  if (record) record[field] = value;

  // Switching a category off is the one action here with reach beyond itself,
  // so it says how far: "hidden, with 12 products" is the fact the merchant
  // needs, and the alternative is discovering the scale by looking at the shop.
  if (field === 'isActive') {
    const n = result.affectedProducts ?? 0;
    note(value
      ? `${record.name} is live again${n ? ` — ${n} product${n === 1 ? '' : 's'} back on the site` : ''}.`
      : `${record.name} is hidden${n ? ` — ${n} product${n === 1 ? '' : 's'} hidden with it` : ''}.`);
    paint();   // redraw: the muted state and the "In menu" lock both follow it
  } else {
    note(`${record.name} ${value ? 'added to' : 'removed from'} the menu.`);
  }
}

async function create(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    await adminFetch('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.value.trim(),
        blurb: form.blurb.value.trim() || null,
      }),
    });
  } catch (err) {
    btn.disabled = false;
    return fail(err.message);
  }

  btn.disabled = false;
  form.reset();
  form.hidden = true;
  await load();
  note('Category created. It is live and in the menu — switch either off if you are not ready.');
}

function note(message) {
  const el = document.querySelector('[data-cat-error]');
  el.textContent = message;
  el.hidden = false;
  el.style.background = 'rgba(46,160,67,.10)';
  el.style.color = '#1a7f37';
}

function fail(message) {
  const el = document.querySelector('[data-cat-error]');
  el.textContent = message;
  el.hidden = false;
  el.style.background = '';
  el.style.color = '';
}
