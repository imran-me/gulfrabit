/**
 * categories-page.js — category management.
 *
 * Switches save immediately, with no Save button. A settings screen where you
 * flip something and then have to remember to confirm it is a screen where
 * people eventually don't, and then wonder why the shop didn't change.
 *
 * The trade is that a failed request must put the switch back, or the panel
 * would show a state the server never accepted. Hence the revert on error.
 *
 * SUB-CATEGORIES are drawn as indented cards under their parent rather than as
 * a collapsible tree. There is one level of nesting and rarely more than a
 * handful of children, so a tree control would add interaction — expand,
 * collapse, remember which — to buy nothing. Everything stays on screen and
 * scannable, which matters more on the phone this panel is mostly used on.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { canDelete, confirmDelete, toast } from './admin-delete.js';

let categories = [];

/**
 * The media module, or null if it is not installed.
 *
 * A static `import` of another module would make this screen fail to load at
 * all if modules/media/ were deleted — a blank Categories page, from removing
 * an unrelated feature. The locked architecture says deleting a module folder
 * cuts off that feature and nothing else, so the import is dynamic and its
 * failure is a supported state: no image thumbnails, everything else intact.
 */
let media = null;

document.addEventListener('admin:ready', init);

async function init() {
  if (!document.querySelector('[data-cat-list]')) return;

  media = await import('/modules/media/media-picker.js').catch(() => null);

  const form = document.querySelector('[data-cat-form]');

  document.querySelector('[data-cat-new]')?.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) form.name.focus();
  });
  document.querySelector('[data-cat-cancel]')?.addEventListener('click', () => {
    form.hidden = true;
    resetForm(form);
  });
  form?.addEventListener('submit', create);

  if (media) {
    media.mountImageFields(form);
  } else {
    // Nothing to mount into, so the placeholder would sit there as an empty
    // box the merchant cannot use.
    form.querySelector('[data-media-field]')?.closest('.afilters__field')?.remove();
  }

  load();
}

async function load() {
  const host = document.querySelector('[data-cat-list]');

  try {
    ({ data: categories } = await adminFetch('/categories'));
  } catch (err) {
    /* The count line lives in the masthead and is only written by paint(),
       which a failed load never reaches — so the heading went on saying
       "Loading…" underneath a page that had already given up and said so.
       Two statements on one screen, contradicting each other, and the stale
       one on top. Every other list screen in the panel clears it here; these
       two were missed. */
    document.querySelector('[data-cat-count]').textContent = '';
    host.innerHTML = `<p class="admin__sub">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — categories appear once the API is live.'
        : escapeHtml(err.message)
    }</p>`;
    return;
  }

  paint();
  fillParentOptions();
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function paint() {
  /* Deleted categories arrive in the same payload — there are a couple of
     dozen categories in total, not a paginated list of thousands, so a
     separate tab would be more navigation than the problem deserves. They are
     kept out of every count and every arrangement above, and drawn in their
     own section underneath. */
  const shown = categories.filter((c) => !c.deletedAt);
  const binned = categories.filter((c) => c.deletedAt);

  const live = shown.filter((c) => c.isActive).length;
  const subs = shown.filter((c) => c.parent).length;

  document.querySelector('[data-cat-count]').textContent =
    `${shown.length} categories${subs ? ` (${subs} sub)` : ''} · ${live} live on the site`;

  const parents = shown.filter((c) => !c.parent);
  const orphans = shown.filter((c) => c.parent && !byslug(c.parent));

  const html = parents.map((p) => {
    const children = shown.filter((c) => c.parent === p.slug);

    return card(p) + (children.length
      ? `<div class="acat-kids">${children.map((c) => card(c, p)).join('')}</div>`
      : '');
  }).join('');

  // A child whose parent is missing would otherwise not be drawn at all — the
  // merchant would see the count drop and have nothing to click.
  document.querySelector('[data-cat-list]').innerHTML =
    html + orphans.map((c) => card(c)).join('');

  paintBin(binned);
  hideBrokenThumbs();
  wire();
}

/**
 * What has been deleted, under everything else.
 *
 * Present only when there is something in it. A permanently visible "Deleted
 * (0)" heading on a screen that is mostly used for arranging live categories
 * is a heading people stop seeing.
 */
function paintBin(binned) {
  const host = document.querySelector('[data-cat-bin]');
  if (!host) return;

  host.hidden = !binned.length;
  if (!binned.length) { host.innerHTML = ''; return; }

  host.innerHTML = `
    <h2 class="h5">Deleted</h2>
    <p class="admin__sub" style="margin-top:0">
      Restoring brings back the slug, the blurb, the image and the place in the menu — none of
      which survive being re-typed, because a new slug is a new URL.
    </p>
    <div class="acat-grid">${binned.map((c) => card(c)).join('')}</div>`;
}

/**
 * A thumbnail whose file is not there should look like no thumbnail, not like
 * a broken page.
 *
 * The image path is a plain column: it can name a file that was deleted from
 * disk, or one that a seed named and nobody ever created — eight categories
 * shipped pointing at SVGs that do not exist, and the screen showed eight
 * broken-image glyphs. There is already a designed empty state ("+ image"), so
 * falling back to it costs nothing and says the true thing.
 *
 * Listener rather than an inline onerror: the CSP allows inline handlers, but
 * a page that never needs one is a page that cannot be surprised by them.
 */
function hideBrokenThumbs() {
  for (const img of document.querySelectorAll('.acat__thumb img')) {
    img.addEventListener('error', () => {
      const host = img.closest('.acat__thumb');
      if (!host) return;
      host.innerHTML = '<span class="acat__thumb-empty">+<br>image</span>';
      if (host.tagName === 'BUTTON') host.title = 'Add an image';
    }, { once: true });
  }
}

function card(c, parent = null) {
  // A sub-category under a switched-off parent is hidden from the site no
  // matter what its own switch says (Product::scopeActive checks the parent).
  // Saying so on the card is the difference between "my switch is on but the
  // products are gone" being a bug and being an explanation.
  const mutedByParent = parent && !parent.isActive;
  const off = !c.isActive || mutedByParent;

  // A deleted category is not arrangeable, switchable or editable — it is not
  // in the catalogue. Drawing its switches would offer to publish something
  // that is not there.
  if (c.deletedAt) {
    return `
    <article class="acat is-off is-deleted" data-cat="${escapeHtml(c.slug)}">
      <div class="acat__head">
        ${thumb(c)}
        <div class="acat__ident">
          <h2 class="acat__name">${escapeHtml(c.name)}</h2>
          <span class="acat__slug">/${escapeHtml(c.slug)}</span>
        </div>
      </div>
      <div class="acat__counts">
        <div><strong>${c.products}</strong> products</div>
      </div>
      ${canDelete()
        ? '<div class="acat__switches"><button type="button" class="btn-gr btn-outline-gr btn-sm-gr" data-cat-restore>Restore</button></div>'
        : ''}
    </article>`;
  }

  return `
    <article class="acat${off ? ' is-off' : ''}${parent ? ' acat--child' : ''}"
             data-cat="${escapeHtml(c.slug)}">
      <div class="acat__head">
        ${thumb(c)}
        <div class="acat__ident">
          <h2 class="acat__name">${escapeHtml(c.name)}</h2>
          <span class="acat__slug">/${escapeHtml(c.slug)}</span>
        </div>
        ${c.audience === 'b2b' ? '<span class="apill apill--info">B2B</span>' : ''}
        ${parent ? '' : order(c)}
      </div>

      ${c.blurb ? `<p class="acat__blurb">${escapeHtml(c.blurb)}</p>` : ''}

      ${mutedByParent
        ? `<p class="acat__warn">Hidden because <strong>${escapeHtml(parent.name)}</strong> is switched off.</p>`
        : ''}

      <div class="acat__counts">
        <div><strong>${c.products}</strong> products</div>
        <div><strong>${off ? 0 : c.liveProducts}</strong> visible</div>
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
        ${
          // Pushed to the far end of the row by .acat__delete, away from the
          // two switches this screen is mostly used to flip. The server still
          // refuses while products or sub-categories are attached; the button
          // is drawn anyway so the refusal can explain itself, which is more
          // use than a control that is silently missing.
          canDelete()
            ? '<button type="button" class="alink-btn alink-btn--danger acat__delete" data-cat-delete>Delete</button>'
            : ''
        }
      </div>
    </article>`;
}

/**
 * The picture, which is also the button that changes it.
 *
 * Without the media module there is nothing to open, so it degrades to a plain
 * <img> when an image is already set and disappears entirely when one is not —
 * rather than offering a button that cannot do anything.
 */
function thumb(c) {
  if (!media) {
    return c.image
      ? `<span class="acat__thumb"><img src="${escapeHtml(c.image)}" alt=""></span>`
      : '';
  }

  return `
    <button type="button" class="acat__thumb" data-cat-image
            title="${c.image ? 'Change image' : 'Add an image'}">
      ${c.image
        ? `<img src="${escapeHtml(c.image)}" alt="">`
        : '<span class="acat__thumb-empty">+<br>image</span>'}
    </button>`;
}

/**
 * Move a top-level category earlier or later.
 *
 * This order is the order of the header menu, the category listing and this
 * screen — one arrangement, not three. A separate "menu order" field existed
 * on the table and was never exposed, because two orderings a merchant has to
 * keep in step is two orderings that drift apart.
 *
 * Sub-categories have no arrows: they sit under their parent and their order
 * among themselves is not something the header menu makes visible.
 */
function order(c) {
  const tops = categories.filter((t) => !t.parent);
  const i = tops.findIndex((t) => t.slug === c.slug);

  return `
    <span class="acat__order">
      <button type="button" data-order="up" ${i <= 0 ? 'disabled' : ''}
              title="Move earlier" aria-label="Move earlier">&#8593;</button>
      <button type="button" data-order="down" ${i === tops.length - 1 ? 'disabled' : ''}
              title="Move later" aria-label="Move later">&#8595;</button>
    </span>`;
}

function wire() {
  document.querySelectorAll('[data-cat] [data-toggle]').forEach((input) => {
    input.addEventListener('change', () => toggle(input));
  });

  document.querySelectorAll('[data-order]').forEach((btn) => {
    btn.addEventListener('click', () => move(btn.closest('[data-cat]').dataset.cat, btn.dataset.order));
  });

  document.querySelectorAll('[data-cat-image]').forEach((btn) => {
    btn.addEventListener('click', () => changeImage(btn));
  });

  document.querySelectorAll('[data-cat-delete]').forEach((btn) => {
    btn.addEventListener('click', () => remove(btn));
  });

  document.querySelectorAll('[data-cat-restore]').forEach((btn) => {
    btn.addEventListener('click', () => putBack(btn));
  });
}

/**
 * Only top-level categories can be a parent, and a category that already has
 * children cannot become one. Both rules are enforced server-side too — this
 * list exists so the merchant is not offered a choice that will be refused.
 */
function fillParentOptions() {
  const select = document.querySelector('[data-cat-parents]');
  if (!select) return;

  // Deleted categories are excluded: offering one as a parent would create a
  // sub-category inside something that is not in the catalogue, and the new
  // child would be invisible the moment it was made.
  const eligible = categories.filter((c) => !c.parent && !c.deletedAt);
  const keep = select.value;

  select.innerHTML = '<option value="">Top level — its own category</option>'
    + eligible.map((c) =>
      `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');

  if (eligible.some((c) => c.slug === keep)) select.value = keep;
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

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

  const record = byslug(slug);
  if (record) record[field] = value;

  // Switching a category off is the one action here with reach beyond itself,
  // so it says how far: "hidden, with 12 products" is the fact the merchant
  // needs, and the alternative is discovering the scale by looking at the shop.
  if (field === 'isActive') {
    const n = result.affectedProducts ?? 0;
    const kids = categories.filter((c) => c.parent === slug).length;
    const withSubs = kids ? ` and ${kids} sub-categor${kids === 1 ? 'y' : 'ies'}` : '';

    note(value
      ? `${record.name} is live again${withSubs}${n ? ` — ${n} product${n === 1 ? '' : 's'} back on the site` : ''}.`
      : `${record.name} is hidden${withSubs}${n ? ` — ${n} product${n === 1 ? '' : 's'} hidden with it` : ''}.`);

    paint();   // redraw: the muted state, the child warnings and the menu lock all follow it
  } else {
    note(`${record.name} ${value ? 'added to' : 'removed from'} the menu.`);
  }
}

/**
 * Swap a top-level category with its neighbour.
 *
 * Both rows are written, because swapping two positions needs two writes and
 * a half-applied swap leaves two categories claiming the same slot. If the
 * second write fails the first is put back, so the shop never shows an order
 * this screen is not showing.
 */
async function move(slug, direction) {
  const tops = categories.filter((c) => !c.parent);
  const i = tops.findIndex((c) => c.slug === slug);
  const j = direction === 'up' ? i - 1 : i + 1;

  if (i < 0 || j < 0 || j >= tops.length) return;

  const a = tops[i];
  const b = tops[j];

  // Positions are rewritten from the list index rather than swapping the two
  // stored numbers. Seeded categories share sort_order values, and swapping
  // equal numbers changes nothing at all — which reads as a broken button.
  const reordered = [...tops];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];

  const before = new Map(tops.map((c) => [c.slug, c.sortOrder]));
  reordered.forEach((c, n) => { c.sortOrder = (n + 1) * 10; });

  categories.sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
  paint();

  try {
    // Only the two that actually moved need writing when the rest already had
    // distinct positions; sending all of them is simpler and, at eighteen
    // categories, cheaper than working out which is which.
    await Promise.all(reordered.map((c) => adminFetch(`/categories/${encodeURIComponent(c.slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sortOrder: c.sortOrder }),
    })));
  } catch (err) {
    reordered.forEach((c) => { c.sortOrder = before.get(c.slug); });
    await load();
    return fail(err.message);
  }

  note(`${a.name} moved ${direction === 'up' ? 'above' : 'below'} ${b.name}. `
    + 'The header menu follows this order.');
}

async function changeImage(btn) {
  const slug = btn.closest('[data-cat]').dataset.cat;
  const asset = await media.pickImage();
  if (!asset) return;

  const record = byslug(slug);
  const previous = record?.image ?? null;

  // Paint first. The picker has already closed, and a thumbnail that only
  // appears after a round-trip reads as the choice not having registered.
  if (record) record.image = asset.url;
  paint();

  try {
    await adminFetch(`/categories/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: asset.url }),
    });
  } catch (err) {
    if (record) record.image = previous;
    paint();
    return fail(err.message);
  }

  note(`Image set for ${record?.name ?? slug}.`);
}

async function create(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  const parent = form.parent.value || null;

  try {
    await adminFetch('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.value.trim(),
        blurb: form.blurb.value.trim() || null,
        // Absent when the media module is not installed — the field was
        // removed in init(), so form.image does not exist.
        image: form.image?.value || null,
        parent,
      }),
    });
  } catch (err) {
    btn.disabled = false;
    return fail(err.message);
  }

  btn.disabled = false;
  resetForm(form);
  form.hidden = true;
  await load();

  note(parent
    ? `Sub-category created inside ${byslug(parent)?.name ?? parent}. It is live — switch it off if you are not ready.`
    : 'Category created. It is live and in the menu — switch either off if you are not ready.');
}

/**
 * form.reset() puts <input> and <select> back but knows nothing about the
 * media field, which keeps its state in a data attribute and a rendered
 * thumbnail. Left alone, the next category created would silently inherit the
 * previous one's picture.
 */
function resetForm(form) {
  form.reset();

  const field = form.querySelector('[data-media-field]');
  if (!field) return;

  field.dataset.value = '';
  field.querySelector('input[type="hidden"]').value = '';
  field.querySelector('[data-thumb]').innerHTML =
    '<span class="mfield__empty">No image</span>';
  field.querySelector('[data-choose]').textContent = 'Choose image';
  field.querySelector('[data-clear]').hidden = true;
}

/* ------------------------------------------------------------------ */

const byslug = (slug) => categories.find((c) => c.slug === slug);

/* ---- Deleting -----------------------------------------------------------
   The server refuses while products or sub-categories are attached, and those
   refusals are the useful part of this control: they tell the merchant what is
   in the way. So the button is drawn on every card and the answer is shown,
   rather than the button being hidden and the reason with it. */

async function remove(btn) {
  const slug = btn.closest('[data-cat]').dataset.cat;
  const c = byslug(slug);
  if (!c) return;

  const ok = await confirmDelete({
    title: `Delete ${c.name}?`,
    // The product count is the fact that decides whether this will even be
    // allowed, so it is the fact the dialog leads with.
    body: c.products > 0
      ? `${c.products} product${c.products === 1 ? ' is' : 's are'} in this category. `
        + 'The server will refuse — switch the category off instead, which hides it and its '
        + 'products together.'
      : 'Its slug, blurb, image and place in the menu are kept, and it can be put back.',
  });
  if (!ok) return;

  btn.disabled = true;

  try {
    const { message } = await adminFetch(`/categories/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    toast(message || `${c.name} deleted.`);
  } catch (err) {
    btn.disabled = false;
    // 422 here is the server explaining what is attached. That sentence is the
    // whole value of the click, so it goes in the loud toast rather than the
    // quiet one.
    return toast(err.message, false);
  }

  load();
}

async function putBack(btn) {
  const slug = btn.closest('[data-cat]').dataset.cat;
  const c = byslug(slug);

  btn.disabled = true;
  btn.textContent = 'Restoring…';

  try {
    const { message } = await adminFetch(
      `/categories/${encodeURIComponent(slug)}/restore`, { method: 'POST' });
    toast(message || `${c?.name ?? 'Category'} is back.`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Restore';
    return toast(err.message, false);
  }

  load();
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

  // Brought to the person who pressed the button, not just unhidden somewhere
  // below them. See the note on fail() in product-edit-page.js: an error slot
  // further down the page than the control that triggered it reads as the
  // button having done nothing at all.
  el.tabIndex = -1;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });

  el.style.color = '';
}
