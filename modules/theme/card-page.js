/**
 * card-page.js — the Product cards screen.
 *
 * Fourteen checkboxes and one publish. The screen itself is authored in
 * card.main.html, because which parts a card has is a structural fact about the
 * card — it changes in the same commit that adds the CSS to hide a new one.
 * This file only moves values in and out of controls that already exist.
 *
 * PUBLISHING IS A SERVER ACTION OR IT IS NOTHING, and PREVIEW IS A DIFFERENT
 * VERB — both for the reasons theme-page.js sets out at length. In particular
 * this screen does NOT mirror what it publishes into localStorage: the only
 * writer of that mirror is the storefront, after a successful server read, so
 * the mirror can only ever be a copy of what visitors are actually seeing.
 */

import { adminFetch, isBackendAbsent } from '/modules/admin/backend/api.js';

/** Keep in step with Modules\Theme\Models\CardParts::PARTS. */
const PARTS = ['wishlist', 'quickview', 'discount', 'tags', 'brand', 'rating', 'saving'];

document.addEventListener('admin:ready', init);

async function init() {
  const form = document.querySelector('[data-card-form]');
  if (!form) return;

  const status = form.querySelector('[data-card-status]');
  const saveBtn = form.querySelector('[data-card-save]');
  const offline = form.querySelector('[data-card-offline]');

  try {
    const { data } = await adminFetch('/product-card');
    fill(form, data?.card);
  } catch (err) {
    if (isBackendAbsent(err)) {
      // Not an error state — a static deployment is a supported way to run this
      // shop. But the merchant has to know this button cannot reach visitors.
      offline.hidden = false;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Publishing needs the backend';
    } else {
      status.textContent = `Couldn’t read the current card: ${err.message}`;
    }
  }

  const syncPreviews = () => {
    const chosen = read(form);
    form.querySelectorAll('[data-card-preview]').forEach((link) => {
      const device = link.dataset.cardPreview;
      // Only what is OFF, exactly as the attribute wants it. An empty value is
      // a real answer — "preview the whole card" — so the parameter stays.
      const off = PARTS.filter((p) => !chosen[p][device]).map((p) => `${p}:off`).join(' ');
      link.href = `/index.html?card=${encodeURIComponent(off)}`;
    });
  };
  /* The word beside each tick follows it, so a glance down a column reads as
     a list of what the card does and does not show rather than a grid of
     boxes to decode. */
  const relabel = () => form.querySelectorAll('.card-tick').forEach((tick) => {
    const box = tick.querySelector('input');
    tick.querySelector('span').textContent = box.checked ? 'Shown' : 'Hidden';
  });
  relabel();

  form.addEventListener('change', () => { syncPreviews(); relabel(); });
  syncPreviews();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    status.textContent = 'Publishing…';

    try {
      const { data } = await adminFetch('/product-card', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: read(form) }),
      });
      /* Redrawn from the RESPONSE, not from what was sent: the server
         normalises what it stores, so this is the one moment the screen can be
         sure it is showing the shop rather than the intention. */
      fill(form, data?.card);
      syncPreviews();
      relabel();
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
 * The form, as an answer.
 *
 * The checkboxes are named "part.device", so the shape the API wants is already
 * written in the markup and this needs no list of its own to walk.
 */
function read(form) {
  const out = {};
  form.querySelectorAll('input[type="checkbox"][name*="."]').forEach((box) => {
    const [part, device] = box.name.split('.');
    (out[part] ??= {})[device] = box.checked;
  });
  return out;
}

/** An answer, into the form. A part the markup does not know about is ignored. */
function fill(form, card) {
  if (!card) return;
  form.querySelectorAll('input[type="checkbox"][name*="."]').forEach((box) => {
    const [part, device] = box.name.split('.');
    const value = card[part]?.[device];
    if (typeof value === 'boolean') box.checked = value;
  });
}
