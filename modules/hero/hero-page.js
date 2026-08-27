/**
 * hero-page.js — the home page banner manager.
 *
 * WHAT A BANNER IS, FROM THIS SCREEN'S POINT OF VIEW
 * --------------------------------------------------
 * A picture, a sentence describing it for people who cannot see it, and a
 * destination. Everything else on the row — the order, the schedule, the
 * on/off — is about WHEN it shows, not what it is.
 *
 * WHY THE DESTINATION IS A PICKER AND NOT A URL BOX
 * -------------------------------------------------
 * Because the merchant knows "the Ajwa dates", not "gr-1101", and certainly not
 * "/modules/catalog/product.html?id=gr-1101". Typing a URL is also the one way
 * to point a banner at a page that does not exist and not find out until a
 * customer does. So: choose a product or a category by name, and the URL is the
 * server's problem — which is also what lets every banner survive the day
 * product URLs change.
 *
 * SAVING IS PER-ROW AND IMMEDIATE
 * -------------------------------
 * No draft state, no "save all" at the bottom. Each row owns its own record and
 * writes when you finish with a field, because a screen holding six unsaved
 * banners is a screen that loses them when the phone rings.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';
import { canDelete, confirmDelete, toast } from '../admin/admin-delete.js';

let slides = [];
let settings = {};
let products = [];
let categories = [];
let media = null;

document.addEventListener('admin:ready', init);

async function init() {
  if (!document.querySelector('[data-hero-list]')) return;

  // Optional, exactly like the categories screen: with modules/media deleted
  // the rest of this page still works and the button says why it cannot.
  media = await import('/modules/media/media-picker.js').catch(() => null);

  document.querySelector('[data-hero-add]').addEventListener('click', addSlide);
  document.querySelector('[data-hero-settings]')
    .addEventListener('change', saveSettings);

  // One listener for the whole list — rows are repainted constantly.
  document.querySelector('[data-hero-list]').addEventListener('click', onClick);
  document.querySelector('[data-hero-list]').addEventListener('change', onChange);

  await load();
}

async function load() {
  const host = document.querySelector('[data-hero-list]');
  host.innerHTML = '<p class="admin__sub">Loading…</p>';

  try {
    const payload = await adminFetch('/hero');
    slides = payload.data;
    settings = payload.meta.settings;

    // The API answered, and answered that its tables are not there yet. Said
    // plainly with the command that fixes it, because "no banners" and "this
    // feature is not installed on the server" look identical otherwise — and
    // one of them is somebody adding banners into a void.
    if (payload.meta.ready === false && !slides.length) {
      host.innerHTML = `
        <div class="acard">
          <h2 class="h5" style="margin:0 0 var(--space-2)">Almost there — one command left</h2>
          <p class="admin__sub" style="margin:0">
            The banner tables have not been created on the server yet. Over SSH, run:
            <code>bash migrate.sh</code> in the site folder, then reload this page.
          </p>
        </div>`;
      paintSettings();
      paintPreview();
      return;
    }
  } catch (err) {
    host.innerHTML = `<p class="admin__sub">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — banners appear once the API is live. '
          + 'If the API is running, this module\'s migration may not have been applied.'
        : escapeHtml(err.message)
    }</p>`;
    return;
  }

  // The pickers need names, not ids. Fetched once and reused by every row;
  // both are small and both are already cached by the panel's other screens.
  await Promise.all([
    adminFetch('/products?perPage=100').then((r) => { products = r.data; }).catch(() => {}),
    adminFetch('/categories').then((r) => { categories = r.data; }).catch(() => {}),
  ]);

  paintSettings();
  paint();
}

function paintSettings() {
  const form = document.querySelector('[data-hero-settings]');
  form.intervalMs.value = String(settings.intervalMs ?? 6000);
  form.transition.value = settings.transition ?? 'fade';
  form.transitionMs.value = String(settings.transitionMs ?? 600);
  form.easing.value = settings.easing ?? 'ease-in-out';
  form.kenBurns.value = settings.kenBurns ? '1' : '0';
  form.autoplay.value = settings.autoplay ? '1' : '0';
}

/**
 * The running order — every banner that is actually in the rotation.
 *
 * Deleted banners keep their sort_order, so a restore returns them to the
 * place they held rather than to the end. That means the payload has them
 * interleaved with the live ones, and anything that walks the rotation by
 * index — the up/down arrows, the preview — has to walk this instead.
 */
const ordered = () => slides.filter((s) => !s.deletedAt);

function paint() {
  const host = document.querySelector('[data-hero-list]');

  /* Deleted banners arrive in the same payload and are kept out of the running
     order entirely — out of the count, out of the drag order, and out of the
     preview. A deleted banner in the list you reorder would take a position in
     a rotation it is not part of. */
  const shown = ordered();
  const binned = slides.filter((s) => s.deletedAt);
  const live = shown.filter((s) => s.isActive).length;

  document.querySelector('[data-hero-count]').textContent = shown.length === 0
    ? 'No banners yet — the home page is showing its built-in artwork.'
    : `${shown.length} banner${shown.length === 1 ? '' : 's'}, ${live} live`;

  if (!shown.length) {
    host.innerHTML = `
      <div class="acard" style="text-align:center">
        <p class="admin__sub" style="margin:0">
          Add your first banner. Nothing changes on the site until one is switched on.
        </p>
      </div>`;
    paintBin(binned);
    paintPreview();
    return;
  }

  host.innerHTML = shown.map((s, i) => row(s, i, shown.length)).join('');
  paintBin(binned);
  paintPreview();
}

/**
 * Deleted banners, under the running order.
 *
 * Their headline and image are shown, because that is how somebody recognises
 * the one they meant to keep — a list of "Banner 4, Banner 7" would be a list
 * nobody can use.
 */
function paintBin(binned) {
  const host = document.querySelector('[data-hero-bin]');
  if (!host) return;

  host.hidden = !binned.length;
  if (!binned.length) { host.innerHTML = ''; return; }

  host.innerHTML = `
    <h2 class="h5">Deleted</h2>
    <p class="admin__sub" style="margin-top:0">
      Restoring brings the banner back switched off, in the place it held in the rotation.
    </p>
    ${binned.map((s) => `
      <article class="acard aslide is-deleted">
        <div class="aslide__head">
          ${s.image ? `<img class="aslide__thumb" src="${escapeHtml(s.image)}" alt="">` : ''}
          <div>
            <strong>${escapeHtml(s.headline || 'Untitled banner')}</strong>
            ${s.subline ? `<div class="atable__sub">${escapeHtml(s.subline)}</div>` : ''}
          </div>
          ${canDelete('content')
            ? `<button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
                       data-hero-restore="${s.id}">Restore</button>`
            : ''}
        </div>
      </article>`).join('')}`;

  host.querySelectorAll('[data-hero-restore]').forEach((btn) => {
    btn.addEventListener('click', () => putBack(btn));
  });
}

/* ---- Preview -----------------------------------------------------------
   The same carousel a customer gets, at a sixth of the size.

   Rebuilt from scratch on every change rather than patched. A carousel is a
   timer plus an index, and reconciling those against an edited slide list is
   how a preview ends up showing the third banner when there are two — the
   whole point of this box is that it cannot disagree with the site. */
let previewTimer = null;

function paintPreview() {
  const host = document.querySelector('[data-hero-preview]');
  if (!host) return;

  clearInterval(previewTimer);
  previewTimer = null;

  // What the STOREFRONT would show, not what this screen holds: switched-off
  // banners and ones outside their dates are exactly what a merchant is trying
  // to confirm are absent.
  const live = ordered().filter((s) => s.isActive && inSchedule(s));

  if (!live.length) {
    host.innerHTML = `
      <div class="apreview__empty">
        No live banners — the home page is showing the artwork built into the site.
      </div>`;
    return;
  }

  const easing = settings.easing === 'spring'
    ? 'cubic-bezier(.34,1.56,.64,1)'
    : (settings.easing || 'ease-in-out');

  host.style.setProperty('--hero-interval', `${settings.intervalMs ?? 6000}ms`);
  host.style.setProperty('--hero-transition', `${settings.transitionMs ?? 600}ms`);
  host.style.setProperty('--hero-easing', easing);
  host.dataset.transition = settings.transition || 'fade';
  host.classList.toggle('is-ken-burns', Boolean(settings.kenBurns));

  host.innerHTML = `
    <div class="apreview__stage">
      ${live.map((s, i) => `
        <figure class="apreview__slide${i === 0 ? ' is-active' : ''}">
          <img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.alt || '')}">
          ${s.headline ? `<figcaption>${escapeHtml(s.headline)}</figcaption>` : ''}
        </figure>`).join('')}
    </div>
    <div class="apreview__dots">
      ${live.map((s, i) => `
        <span class="apreview__dot${i === 0 ? ' is-active' : ''}"
              title="${escapeHtml(s.alt || '')}"></span>`).join('')}
    </div>`;

  const figures = [...host.querySelectorAll('.apreview__slide')];
  const dots = [...host.querySelectorAll('.apreview__dot')];
  let i = 0;

  // A single banner is a still picture. Running a timer to re-show the slide
  // already showing is the same waste here as on the storefront.
  if (!settings.autoplay || live.length < 2) return;

  previewTimer = setInterval(() => {
    i = (i + 1) % figures.length;
    figures.forEach((f, n) => f.classList.toggle('is-active', n === i));
    dots.forEach((d, n) => d.classList.toggle('is-active', n === i));
  }, settings.intervalMs ?? 6000);
}

/** Today against a slide's optional start/end, matching the server's scope. */
function inSchedule(s) {
  const now = Date.now();
  if (s.startsAt && new Date(s.startsAt).getTime() > now) return false;
  if (s.endsAt && new Date(s.endsAt).getTime() < now) return false;
  return true;
}

function row(s, i, total) {
  const first = i === 0;
  // Counted against the running order, not the payload — which now also
  // carries deleted banners, and a down-arrow disabled by one of those would
  // be disabled on the wrong row.
  const last = i === total - 1;

  return `
    <section class="acard aslide${s.isActive ? '' : ' is-off'}" data-slide="${s.id}">
      <div class="aslide__grid">
        <div class="aslide__media">
          ${s.image
            ? `<img src="${escapeHtml(s.image)}" alt="">`
            : '<div class="aslide__empty">No image</div>'}
          <button class="btn-gr btn-outline-gr btn-sm-gr" type="button" data-act="image">
            ${s.image ? 'Change picture' : 'Choose picture'}
          </button>
        </div>

        <div class="aslide__fields">
          <div class="afilters__field afilters__field--wide">
            <label for="alt-${s.id}">Describe the picture <span class="admin__sub">— read aloud to blind visitors, and shown if the image fails</span></label>
            <input class="input-gr" id="alt-${s.id}" data-field="alt" type="text"
                   value="${escapeHtml(s.alt || '')}" maxlength="255"
                   placeholder="e.g. Premium Iranian saffron in a glass jar">
          </div>

          <div class="afilters__field">
            <label for="lt-${s.id}">Clicking it opens</label>
            <select class="select-gr" id="lt-${s.id}" data-field="linkType">
              <option value="none"${s.linkType === 'none' ? ' selected' : ''}>Nothing — just a picture</option>
              <option value="product"${s.linkType === 'product' ? ' selected' : ''}>A product</option>
              <option value="category"${s.linkType === 'category' ? ' selected' : ''}>A category</option>
              <option value="custom"${s.linkType === 'custom' ? ' selected' : ''}>Another page on this site</option>
            </select>
          </div>

          <div class="afilters__field afilters__field--wide">${linkValueField(s)}</div>

          <div class="afilters__field">
            <label for="sa-${s.id}">Show from <span class="admin__sub">— optional</span></label>
            <input class="input-gr" id="sa-${s.id}" data-field="startsAt" type="date"
                   value="${(s.startsAt || '').slice(0, 10)}">
          </div>
          <div class="afilters__field">
            <label for="ea-${s.id}">Stop showing <span class="admin__sub">— optional</span></label>
            <input class="input-gr" id="ea-${s.id}" data-field="endsAt" type="date"
                   value="${(s.endsAt || '').slice(0, 10)}">
          </div>
        </div>
      </div>

      <div class="aslide__foot">
        <span class="apill apill--label apill--${s.isActive ? 'ok' : 'wait'}">${s.isActive ? 'Live' : 'Off'}</span>
        ${s.href
          ? `<span class="atable__sub">Goes to <code>${escapeHtml(s.href)}</code></span>`
          : '<span class="atable__sub">Not clickable</span>'}
        <span class="aslide__spacer"></span>
        <button class="btn-gr btn-ghost-gr btn-sm-gr" type="button" data-act="up" ${first ? 'disabled' : ''}>↑</button>
        <button class="btn-gr btn-ghost-gr btn-sm-gr" type="button" data-act="down" ${last ? 'disabled' : ''}>↓</button>
        <button class="btn-gr btn-outline-gr btn-sm-gr" type="button" data-act="toggle">
          ${s.isActive ? 'Switch off' : 'Switch on'}
        </button>
        <button class="btn-gr btn-outline-gr btn-sm-gr" type="button" data-act="delete">Delete</button>
      </div>
    </section>`;
}

/** The second half of the destination: which product, which category, or a path. */
function linkValueField(s) {
  if (s.linkType === 'none') return '';

  if (s.linkType === 'product') {
    return `
      <label for="lv-${s.id}">Which product</label>
      <select class="select-gr" id="lv-${s.id}" data-field="linkValue">
        <option value="">Choose a product…</option>
        ${products.map((p) => `
          <option value="${escapeHtml(p.sku ?? p.id)}"${(s.linkValue === (p.sku ?? p.id)) ? ' selected' : ''}>
            ${escapeHtml(p.title ?? p.name)}
          </option>`).join('')}
      </select>`;
  }

  if (s.linkType === 'category') {
    return `
      <label for="lv-${s.id}">Which category</label>
      <select class="select-gr" id="lv-${s.id}" data-field="linkValue">
        <option value="">Choose a category…</option>
        ${categories.map((c) => `
          <option value="${escapeHtml(c.slug)}"${s.linkValue === c.slug ? ' selected' : ''}>
            ${escapeHtml(c.name)}
          </option>`).join('')}
      </select>`;
  }

  return `
    <label for="lv-${s.id}">Path on this site</label>
    <input class="input-gr" id="lv-${s.id}" data-field="linkValue" type="text"
           value="${escapeHtml(s.linkValue || '')}" placeholder="/modules/content/about.html">
    <span class="admin__sub">Must start with “/”. Links to other websites are not allowed here.</span>`;
}

/* ---- Actions ----------------------------------------------------------- */

function slideOf(el) {
  const id = Number(el.closest('[data-slide]').dataset.slide);
  return slides.find((s) => s.id === id);
}

async function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const s = slideOf(btn);

  switch (btn.dataset.act) {
    case 'image':  return chooseImage(s);
    case 'toggle': return save(s, { isActive: !s.isActive });
    case 'delete': return remove(s);
    case 'up':     return move(s, -1);
    case 'down':   return move(s, +1);
  }
}

function onChange(e) {
  const field = e.target.closest('[data-field]');
  if (!field) return;
  const s = slideOf(field);
  const key = field.dataset.field;

  // Changing the TYPE changes which second field is drawn, so the row is
  // repainted — and the old value is dropped with it, because a category slug
  // is not a product id and keeping it would submit nonsense.
  if (key === 'linkType') {
    return save(s, { linkType: field.value, linkValue: '' });
  }

  save(s, { [key]: field.value });
}

async function chooseImage(s) {
  if (!media) return fail('The image library is not installed.');
  const asset = await media.pickImage();
  if (!asset) return;
  await save(s, { imagePath: asset.url });
}

/**
 * Write one change, then repaint from what the SERVER returned.
 *
 * Not from what was typed: the server trims, rejects and derives (the href
 * under each row is built there), and a row painted from local state would
 * show a link the site is not actually serving.
 */
async function save(s, changes) {
  const body = {
    // Sent every time because the request treats these as a set — a slide
    // whose type says "product" with no value is refused, and PATCHing one
    // without the other is how that happens by accident.
    linkType: changes.linkType ?? s.linkType,
    linkValue: 'linkValue' in changes ? changes.linkValue : (s.linkValue ?? ''),
    ...changes,
  };

  // Blank dates mean "no schedule", and an empty string is not a date.
  ['startsAt', 'endsAt'].forEach((k) => {
    if (body[k] === '') body[k] = null;
  });

  let saved;
  try {
    ({ data: saved } = await adminFetch(`/hero/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  } catch (err) {
    await load();          // put the row back to what is actually stored
    return fail(err.message);
  }

  Object.assign(s, saved);
  clearError();
  paint();
}

async function addSlide() {
  const btn = document.querySelector('[data-hero-add]');
  btn.disabled = true;

  try {
    const { data } = await adminFetch('/hero', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // A placeholder that is honest about being one. Created off, so an
        // unfinished banner can never be the first thing a customer sees.
        imagePath: '/assets/images/hero/hero-saffron.jpg',
        alt: 'New banner — describe the picture',
        linkType: 'none',
        isActive: false,
      }),
    });
    slides.push(data);
    clearError();
    paint();
  } catch (err) {
    fail(err.message);
  }

  btn.disabled = false;
}

async function remove(s) {
  const ok = await confirmDelete({
    title: s.headline ? `Delete "${s.headline}"?` : 'Delete this banner?',
    // The old wording here was "switching it off keeps it for later; deleting
    // does not", which was honest and was also the reason nobody used this
    // button. Now both keep it, and the difference is what they mean: off is
    // "not now", deleted is "not part of the rotation at all".
    body: 'Its headline, wording, link and picture are kept, and so is its place in the rotation.',
    confirm: 'Delete banner',
  });
  if (!ok) return;

  let message;
  try {
    ({ message } = await adminFetch(`/hero/${s.id}`, { method: 'DELETE' }));
  } catch (err) {
    return fail(err.message);
  }

  clearError();
  toast(message || 'Banner deleted.');
  // Reloaded rather than patched: the banner moves from the running order into
  // the Deleted section, and the server is the one that knows it went off on
  // the way out.
  await load();
}

async function putBack(btn) {
  btn.disabled = true;
  btn.textContent = 'Restoring…';

  let message;
  try {
    ({ message } = await adminFetch(`/hero/${btn.dataset.heroRestore}/restore`, { method: 'POST' }));
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Restore';
    return toast(err.message, false);
  }

  clearError();
  toast(message || 'Banner restored, still switched off.');
  await load();
}

/**
 * Move a banner up or down.
 *
 * The whole running order is sent, because moving one banner changes the
 * position of every banner after it — sending them one at a time leaves the
 * list briefly holding two slides that both think they are third.
 */
async function move(s, delta) {
  // The rotation, not the payload. Deleted banners keep their sort_order so a
  // restore returns them to the place they held, which means they are still
  // interleaved in what the server sends — walking that list would step over
  // a banner nobody can see.
  const list = ordered();
  const from = list.indexOf(s);
  const to = from + delta;
  if (to < 0 || to >= list.length) return;

  list.splice(to, 0, list.splice(from, 1)[0]);
  // Rebuilt so paint() and the next move() both see the arrangement just made.
  slides = [...list, ...slides.filter((x) => x.deletedAt)];
  paint();                                    // instant; the write follows

  try {
    await adminFetch('/hero/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: list.map((x) => x.id) }),
    });
  } catch (err) {
    await load();
    fail(err.message);
  }
}

async function saveSettings(e) {
  const form = e.currentTarget;
  const body = {
    intervalMs: Number(form.intervalMs.value),
    transition: form.transition.value,
    transitionMs: Number(form.transitionMs.value),
    easing: form.easing.value,
    kenBurns: form.kenBurns.value === '1',
    autoplay: form.autoplay.value === '1',
  };

  try {
    ({ data: settings } = await adminFetch('/hero/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    clearError();
    // Immediately, from the SAVED values rather than the form's — so what is
    // being watched is what the site will do, not what was just typed at it.
    paintPreview();
  } catch (err) {
    fail(err.message);
  }
}

function fail(message) {
  const el = document.querySelector('[data-hero-error]');
  el.textContent = message;
  el.hidden = false;
}

function clearError() {
  document.querySelector('[data-hero-error]').hidden = true;
}
