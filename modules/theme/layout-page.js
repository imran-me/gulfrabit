/**
 * layout-page.js — the Home layout screen.
 *
 * Fourteen dropdowns and one publish. The screen itself is authored in
 * layout.main.html, because which sections exist and which shapes they can wear
 * are structural facts about the home page, not data — they change in the same
 * commit that adds the CSS for a new shape. This file only moves values in and
 * out of controls that already exist.
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

/** Keep in step with Modules\Theme\Models\HomeLayout::SECTIONS. */
const DEFAULTS = {
  category: { desktop: 'grid', mobile: 'grid' },
  trust: { desktop: 'static', mobile: 'loop' },
  premium: { desktop: 'march', mobile: 'march' },
  bestseller: { desktop: 'grid', mobile: 'grid' },
  new: { desktop: 'march', mobile: 'march' },
  brands: { desktop: 'wall', mobile: 'wall' },
  testimonials: { desktop: 'slider', mobile: 'slider' },
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
      const tokens = Object.entries(chosen)
        .map(([section, byDevice]) => `${section}:${byDevice[device]}`)
        .join(' ');
      link.href = `/index.html?lay=${encodeURIComponent(tokens)}`;
    });
  };
  form.addEventListener('change', () => { syncPreviews(); paintSwatches(form); });
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
  const out = {};
  form.querySelectorAll('select[name*="."]').forEach((select) => {
    const [section, device] = select.name.split('.');
    (out[section] ??= {})[device] = select.value;
  });
  return out;
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
  form.querySelectorAll('select[name*="."]').forEach((select) => {
    const [section, device] = select.name.split('.');
    const value = layout[section]?.[device];
    if (value && [...select.options].some((o) => o.value === value)) select.value = value;
  });
}
