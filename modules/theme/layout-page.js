/**
 * layout-page.js — the Home layout screen.
 *
 * Two lists, fourteen dropdowns and one publish. The screen itself is authored
 * in layout.main.html, because which sections exist, what they are called and
 * which shapes they can wear are structural facts about the home page, not
 * data — they change in the same commit that adds the CSS for a new shape.
 * This file only moves values in and out of controls that already exist, and
 * moves list items past one another.
 *
 * THE ORDER IS READ OFF THE DOM, NOT HELD IN A VARIABLE
 * -----------------------------------------------------
 * The <li>s themselves ARE the order. There is no array here kept in step with
 * what the merchant can see, because the two could disagree and then one of
 * them would be publishing. Moving a section is one insertBefore; reading the
 * order back is one map over the list. The position numbers are a CSS counter
 * for the same reason — nothing to renumber means nothing to renumber wrong.
 *
 * PUBLISHING IS A SERVER ACTION OR IT IS NOTHING
 * ----------------------------------------------
 * The arrangement is universal — one layout, every visitor — so this screen
 * writes it in exactly one place, the server, and it does NOT mirror the value
 * into localStorage on the way past. theme-page.js has the long version of why:
 * a write that "succeeds" locally shows the merchant a shop nobody else is
 * looking at, and that failure is invisible until a customer mentions it. The
 * only writer of that mirror is the storefront, after a successful server READ.
 *
 * PREVIEW IS A DIFFERENT VERB, AND IT SAYS SO
 * -------------------------------------------
 * Two links, one per column, each opening the home page with ?lay= — no
 * storage, nothing published, and a URL that can be sent to somebody else.
 */

import { adminFetch, isBackendAbsent } from '/modules/admin/backend/api.js';

/** Keep in step with Modules\Theme\Models\HomeLayout. */
const DEFAULTS = {
  styles: {
    category: { desktop: 'grid', mobile: 'grid' },
    trust: { desktop: 'static', mobile: 'loop' },
    premium: { desktop: 'march', mobile: 'march' },
    bestseller: { desktop: 'grid', mobile: 'grid' },
    new: { desktop: 'march', mobile: 'march' },
    brands: { desktop: 'wall', mobile: 'wall' },
    testimonials: { desktop: 'slider', mobile: 'slider' },
  },
  order: {
    desktop: ['trust', 'category', 'premium', 'bestseller', 'brands', 'new', 'testimonials', 'news'],
    mobile: ['trust', 'category', 'premium', 'bestseller', 'brands', 'new', 'testimonials', 'news'],
  },
};

document.addEventListener('admin:ready', init);

async function init() {
  const form = document.querySelector('[data-layout-form]');
  if (!form) return;

  const status = form.querySelector('[data-layout-status]');
  const saveBtn = form.querySelector('[data-layout-save]');
  const offline = form.querySelector('[data-layout-offline]');

  try {
    const { data } = await adminFetch('/home-layout');
    fill(form, data?.layout);
  } catch (err) {
    if (isBackendAbsent(err)) {
      // Not an error state — a static deployment is a supported way to run this
      // shop. But the merchant has to know this button cannot reach visitors.
      offline.hidden = false;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Publishing needs the backend';
      fill(form, DEFAULTS);
    } else {
      status.textContent = `Couldn’t read the current layout: ${err.message}`;
    }
  }

  paintSwatches(form);

  // The preview links track the dropdowns, so each always previews what the
  // merchant is looking at rather than what is published.
  const syncPreviews = () => {
    const chosen = read(form);
    form.querySelectorAll('[data-layout-preview]').forEach((link) => {
      const device = link.dataset.layoutPreview;
      const tokens = Object.entries(chosen.styles)
        .map(([section, byDevice]) => `${section}:${byDevice[device]}`)
        .join(' ');
      const order = chosen.order[device].join(',');
      link.href = `/index.html?lay=${encodeURIComponent(tokens)}&ord=${encodeURIComponent(order)}`;
    });
  };
  form.addEventListener('change', () => { syncPreviews(); paintSwatches(form); });

  /* One listener on the form rather than sixteen on the buttons: the <li>s are
     moved around underneath, and a listener bound to a node that moves is a
     listener that has to be rebound. This one never does. */
  form.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-order-move]');
    if (!btn || btn.disabled) return;
    move(form, btn);
    syncPreviews();
  });

  form.querySelectorAll('[data-order-list]').forEach(refreshMoves);
  syncPreviews();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    status.textContent = 'Publishing…';

    try {
      const { data } = await adminFetch('/home-layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: read(form) }),
      });
      /* Redrawn from the RESPONSE, not from what was sent. The server
         normalises what it stores, so this is the one moment the screen can be
         certain it is showing the shop rather than the intention — and if the
         two ever differ, the merchant sees which one won. */
      fill(form, data?.layout);
      syncPreviews();
      paintSwatches(form);
      status.textContent = 'Published. Every visitor sees it from their next page load.';
    } catch (err) {
      status.textContent = isBackendAbsent(err)
        ? 'Not published — there is no backend to publish to. Nothing changed for visitors.'
        : `Couldn’t publish: ${err.message}`;
    }

    saveBtn.disabled = false;
  });
}

/**
 * Each dropdown's diagram, set from the option it is on.
 *
 * The swatch is a sibling of the <select> rather than something this file
 * builds, so the markup stays readable and there is no shape here that the
 * stylesheet does not already know how to draw. An unknown value simply leaves
 * the attribute off, and the frame draws its default row — better than a
 * diagram confidently showing the wrong thing.
 */
function paintSwatches(form) {
  form.querySelectorAll('select[name*="."]').forEach((select) => {
    const swatch = select.parentElement?.querySelector('[data-lay-swatch]');
    if (swatch) swatch.dataset.shape = select.value;
  });
}

/**
 * The form, as an arrangement.
 *
 * The dropdowns are named "section.device", so the shape of the object the API
 * wants is already written in the markup and this does not need its own list of
 * sections to walk.
 */
function read(form) {
  const styles = {};
  form.querySelectorAll('select[name*="."]').forEach((select) => {
    const [section, device] = select.name.split('.');
    (styles[section] ??= {})[device] = select.value;
  });

  const order = {};
  form.querySelectorAll('[data-order-list]').forEach((list) => {
    order[list.dataset.orderList] = [...list.children].map((li) => li.dataset.orderItem);
  });

  return { styles, order };
}

/**
 * An arrangement, into the form.
 *
 * A value the markup has no option for is left alone rather than forced — that
 * is a shape this build of the panel does not know about, and silently
 * rewriting it to the first option would publish a change nobody asked for the
 * next time Publish was pressed.
 */
function fill(form, layout) {
  if (!layout) return;
  const styles = layout.styles ?? layout;   // a record from before ordering existed

  form.querySelectorAll('select[name*="."]').forEach((select) => {
    const [section, device] = select.name.split('.');
    const value = styles[section]?.[device];
    if (value && [...select.options].some((o) => o.value === value)) select.value = value;
  });

  form.querySelectorAll('[data-order-list]').forEach((list) => {
    const wanted = layout.order?.[list.dataset.orderList];
    if (Array.isArray(wanted)) fillOrder(list, wanted);
    refreshMoves(list);
  });
}

/**
 * A list of section names, into a list of <li>s.
 *
 * Only names the list actually holds are placed, and each is placed at most
 * once — so a value naming a section this build of the panel does not have
 * cannot empty the list, and a value naming one twice cannot duplicate a row.
 * Anything the value failed to mention keeps its place at the end, which is
 * the same completion the server and the storefront both perform.
 */
function fillOrder(list, wanted) {
  for (const name of wanted) {
    const li = list.querySelector(`[data-order-item="${CSS.escape(name)}"]`);
    if (li) list.appendChild(li);          // appendChild MOVES an existing node
  }
}

/**
 * One press: the section swaps places with its neighbour.
 *
 * Focus is the part worth care. The button moves with its own <li>, so it is
 * still under the cursor and still focused afterwards — press Move up twice
 * and both presses land where the merchant aimed. The exception is a section
 * arriving at an end, where the button it was pressing becomes disabled and
 * the browser would drop focus to the document; that case hands focus to the
 * other arrow on the same row, which is the one that still does something.
 */
function move(form, btn) {
  const li = btn.closest('[data-order-item]');
  const list = li?.parentElement;
  if (!list) return;

  const up = btn.dataset.orderMove === 'up';
  const neighbour = up ? li.previousElementSibling : li.nextElementSibling;
  if (!neighbour) return;

  if (up) list.insertBefore(li, neighbour);
  else list.insertBefore(neighbour, li);

  refreshMoves(list);

  if (btn.disabled) li.querySelector(`[data-order-move="${up ? 'down' : 'up'}"]`)?.focus();
  else btn.focus();

  /* Said out loud, because to anyone not watching the list a press that
     reorders eight rows produced no output at all. The position is read off
     the DOM rather than counted here, for the same reason everything else on
     this screen is. */
  const status = form.querySelector('[data-order-status]');
  if (status) {
    const name = li.querySelector('.lay-order__name')?.textContent.trim() ?? 'Section';
    const where = list.closest('.lay-order__col')?.querySelector('.lay-order__head')?.firstChild?.textContent.trim() ?? '';
    const at = [...list.children].indexOf(li) + 1;
    status.textContent = `${name} moved to position ${at} of ${list.children.length}. ${where}.`;
  }
}

/**
 * The first row cannot go up and the last cannot go down.
 *
 * Disabled rather than removed: a button that vanishes lets the one beside it
 * slide under the cursor, and the next press does something nobody aimed at.
 */
function refreshMoves(list) {
  const items = [...list.children];
  items.forEach((li, i) => {
    const up = li.querySelector('[data-order-move="up"]');
    const down = li.querySelector('[data-order-move="down"]');
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === items.length - 1;
  });
}
