/**
 * highlights-page.js — curating the home page shelves.
 *
 * Each shelf is edited in place and saved with its own button. There is no
 * single Save for the page: a merchant who reorders "Premium picks", then gets
 * distracted, should not lose it because they never scrolled to the bottom —
 * and should not accidentally publish a half-finished second shelf either.
 *
 * Reordering is arrows and a star, matching the product gallery. Same reason:
 * dragging on a touch screen fights the page scroll, and this panel is mostly
 * used on a phone.
 */

import { adminFetch } from '/modules/admin/backend/api.js';
import { escapeHtml } from '/modules/admin/admin-shell.js';
import { mountProductPicker } from '/modules/admin/product-picker.js';

let rails = [];
let dirty = new Set();    // rail keys with unsaved changes

document.addEventListener('admin:ready', init);

async function init() {
  if (!document.querySelector('[data-hl-rails]')) return;

  // Warn before losing work. The browser only honours this after the user has
  // interacted with the page, which is exactly when there is something to lose.
  window.addEventListener('beforeunload', (e) => {
    if (dirty.size) e.preventDefault();
  });

  await load();
}

async function load() {
  const host = document.querySelector('[data-hl-rails]');

  try {
    ({ data: rails } = await adminFetch('/highlights'));
  } catch (err) {
    host.innerHTML = `<p class="admin__sub">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — shelves appear once the API is live.'
        : escapeHtml(err.message)
    }</p>`;
    return;
  }

  dirty.clear();
  paint();
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function paint() {
  const curated = rails.filter((r) => r.items.length).length;

  document.querySelector('[data-hl-count]').textContent =
    `${rails.length} shelves · ${curated} curated, ${rails.length - curated} running on tags`;

  document.querySelector('[data-hl-rails]').innerHTML = rails.map(shelf).join('');

  wire();
  paintSaveBar();
}

function shelf(rail) {
  return `
    <section class="acard hlrail" data-hl-rail="${escapeHtml(rail.rail)}"
             style="margin-bottom:var(--space-5)">
      <div class="acat__head" style="margin-bottom:var(--space-3)">
        <div class="acat__ident">
          <h2 class="h5" style="margin:0">${escapeHtml(rail.label)}</h2>
          <span class="atable__sub">${escapeHtml(rail.blurb)}</span>
        </div>
        <span class="apill ${rail.items.length ? 'apill--ok' : 'apill--wait'}">
          ${rail.items.length ? `${rail.items.length} chosen` : `tag: ${escapeHtml(rail.fallbackTag)}`}
        </span>
      </div>

      ${capacityNote(rail)}

      ${rail.items.length
        ? `<ol class="hllist" data-hl-list>${
            rail.items.map((item, i, all) => row(item, i, all, rail)).join('')
          }</ol>`
        : `<p class="admin__sub" data-hl-list>
             ${rail.emptyNote
               // Per-rail truth from the server: Best Sellers falls back to
               // its authored HTML grid, not to the tag, and saying "showing
               // tagged products" there sent merchants debugging a tag that
               // was working exactly as designed.
               ? escapeHtml(rail.emptyNote)
               : `Nothing chosen. The site is showing products tagged
                  <code>${escapeHtml(rail.fallbackTag)}</code> until you pick some.`}
           </p>`}

      <div class="hlrail__foot">
        <!-- A searchable picker, not a <select>. The dropdown listed every
             product with no way to search it and no thumbnail, which stops
             working somewhere around forty products and is actively wrong past
             a hundred — the list came from one perPage=100 request, so the
             rest of the catalogue was absent with nothing saying so. -->
        <div class="hlrail__add" data-hl-add></div>
        <button type="button" class="btn-gr btn-primary-gr btn-sm-gr" data-hl-save disabled>
          Save this shelf
        </button>
        <span class="atable__sub" data-hl-state></span>
      </div>
    </section>`;
}

/**
 * How many of this shelf's picks actually reach the home page.
 *
 * The rail renders a fixed number — see Highlight::RAILS. Curating twelve into
 * a shelf that shows eight is a legitimate thing to do; the last four are the
 * bench, and they step up when something above them sells out or is switched
 * off. What is not legitimate is doing it by accident, which is what happened
 * before this line existed: you saved twelve, four never appeared, and nothing
 * on the screen said why.
 */
function capacityNote(rail) {
  const shows = rail.shows ?? 0;

  if (!shows || !rail.items.length) return '';

  const live = rail.items.filter((i) => !i.hidden).length;
  const spare = rail.items.length - shows;

  if (live < shows) {
    return `<p class="hlcap hlcap--under">
      This shelf shows ${shows}. ${live === 0 ? 'None' : `Only ${live}`} of your picks
      ${live === 1 ? 'is' : 'are'} on the site, so the rest of the row fills from
      <code>${escapeHtml(rail.fallbackTag)}</code>.
    </p>`;
  }

  if (spare > 0) {
    return `<p class="hlcap">
      Shows the first ${shows}. The other ${spare} ${spare === 1 ? 'is' : 'are'} on the
      bench — they step up when something above them sells out or is switched off.
    </p>`;
  }

  return `<p class="hlcap hlcap--full">Exactly ${shows} — the shelf is full.</p>`;
}

function row(item, i, all, rail) {
  // Past the cut. Dimmed rather than hidden: it is still a pick and can be
  // dragged up, and hiding it would make the count disagree with the list.
  const benched = rail.shows && i >= rail.shows;

  return `
    <li class="hlitem${item.hidden ? ' is-hidden' : ''}${benched ? ' is-benched' : ''}"
        data-sku="${escapeHtml(item.sku)}" draggable="true">
      <span class="hlitem__grip" aria-hidden="true" title="Drag to reorder">⠿</span>
      <span class="hlitem__n">${i + 1}</span>
      <div class="hlitem__pic">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : ''}
      </div>
      <div class="hlitem__body">
        <strong>${escapeHtml(item.title)}</strong>
        <span class="atable__sub">৳${Number(item.price).toLocaleString('en-BD')}</span>
        ${item.hidden
          ? `<span class="apill apill--bad">not on the site — ${escapeHtml(item.hidden)}</span>`
          : ''}
        ${alsoOn(item.sku, rail.rail)}
      </div>
      <!-- Dragging is the fast path and the arrows are the only path that
           works on a touch screen or from a keyboard, so both stay. Same rule
           as the image library. -->
      <div class="hlitem__acts">
        <button type="button" data-move="top" ${i === 0 ? 'disabled' : ''}
                aria-label="Move to first" title="Move to first">&#8607;</button>
        <button type="button" data-move="up" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&#8593;</button>
        <button type="button" data-move="down" ${i === all.length - 1 ? 'disabled' : ''} aria-label="Move down">&#8595;</button>
        <button type="button" data-move="off" class="is-danger" aria-label="Remove from shelf">&times;</button>
      </div>
    </li>`;
}

/**
 * The other shelves this product is already on, as chips you can click.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. Three shelves curated one at a time, with
 * no view across them, is how the same six products end up on all three — the
 * home page then repeats itself twice and the merchant cannot see it from any
 * single screen. A chip that says "also on New arrivals" is that view.
 *
 * Clicking an empty one puts the product on that shelf, which is the other
 * half of it: deciding where something belongs is one decision, and it should
 * not need three searches on three shelves to carry out.
 */
function alsoOn(sku, currentRail) {
  const chips = rails
    .filter((r) => r.rail !== currentRail)
    .map((r) => {
      const on = r.items.some((i) => i.sku === sku);

      return `<button type="button"
        class="hlalso${on ? ' is-on' : ''}"
        data-also="${escapeHtml(r.rail)}" data-also-sku="${escapeHtml(sku)}"
        title="${on ? `On ${r.label} — click to take it off` : `Add to ${r.label}`}">
        ${on ? '&#10003; ' : '+ '}${escapeHtml(r.label)}
      </button>`;
    });

  return `<span class="hlalsos">${chips.join('')}</span>`;
}

/**
 * One bar, fixed to the bottom, naming every shelf with unsaved changes.
 *
 * Save is per shelf and stays per shelf — merchandising three rows is three
 * decisions and one button for all of them would make an accidental edit to
 * the second shelf ride along with a deliberate one to the first. What was
 * missing was noticing: the only signal was a small "not saved yet" beside a
 * button that could be two screens up. beforeunload caught the worst case and
 * a browser dialog is not where you want to learn you had unsaved work.
 */
function paintSaveBar() {
  let bar = document.querySelector('[data-hl-bar]');

  if (!dirty.size) {
    bar?.remove();
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'hlbar';
    bar.setAttribute('data-hl-bar', '');
    bar.setAttribute('role', 'status');
    document.body.append(bar);
  }

  const names = [...dirty]
    .map((key) => rails.find((r) => r.rail === key)?.label ?? key);

  bar.innerHTML = `
    <span class="hlbar__text">
      Unsaved: <strong>${escapeHtml(names.join(', '))}</strong>
    </span>
    <button type="button" class="btn-gr btn-primary-gr btn-sm-gr" data-hl-saveall>
      Save ${dirty.size === 1 ? 'this shelf' : `all ${dirty.size}`}
    </button>`;

  bar.querySelector('[data-hl-saveall]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Saving…';

    // Sequential, not parallel: each save reloads nothing but they all write
    // to the same table, and a merchant watching three shelves save at once
    // cannot tell which one failed.
    for (const key of [...dirty]) {
      await save(key);
    }
  });
}

/* ------------------------------------------------------------------ *
 * Interaction
 * ------------------------------------------------------------------ */

function wire() {
  document.querySelectorAll('[data-hl-rail]').forEach((section) => {
    const key = section.dataset.hlRail;
    const rail = rails.find((r) => r.rail === key);

    section.querySelectorAll('[data-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sku = btn.closest('[data-sku]').dataset.sku;
        const i = rail.items.findIndex((it) => it.sku === sku);

        if (btn.dataset.move === 'up' && i > 0) swap(rail.items, i, i - 1);
        if (btn.dataset.move === 'down' && i < rail.items.length - 1) swap(rail.items, i, i + 1);
        if (btn.dataset.move === 'off') rail.items.splice(i, 1);
        if (btn.dataset.move === 'top' && i > 0) rail.items.unshift(...rail.items.splice(i, 1));

        touch(key);
      });
    });

    // The "also on" chips. Delegated, because the rows are repainted on every
    // edit and rebinding per row would leak a listener each time.
    section.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-also]');
      if (!chip) return;

      const target = rails.find((r) => r.rail === chip.dataset.also);
      const sku = chip.dataset.alsoSku;
      if (!target) return;

      const at = target.items.findIndex((i) => i.sku === sku);

      if (at !== -1) {
        target.items.splice(at, 1);
      } else {
        // Copied from the row that is already on screen, so the new entry has
        // its picture and price without a request. The server is the authority
        // on `hidden` and re-answers it on the next load.
        const source = rail.items.find((i) => i.sku === sku);
        if (!source) return;

        target.items.push({ ...source });
      }

      // BOTH shelves are now unsaved — the one that changed, and this one only
      // if the click also reordered it, which it did not. Mark the target.
      dirty.add(target.rail);
      touch(key);
    });

    wireDrag(section, rail, key);

    const add = section.querySelector('[data-hl-add]');

    if (add) {
      mountProductPicker(add, {
        // Read fresh on every search rather than captured once: the shelf
        // changes underneath the picker as products are added, and a stale
        // set would keep offering one that is already on it.
        exclude: () => new Set(rail.items.map((i) => i.sku)),
        placeholder: `Add to ${rail.label.toLowerCase()}…`,
        onPick: (product) => {
          rail.items.push({
            sku: product.sku,
            title: product.title,
            image: product.image,
            price: product.priceTaka,
            // The server recomputes this on reload; the optimistic value only
            // has to be right about the product's own switch, which is what
            // the search result already told us.
            hidden: product.isActive ? null : 'unlisted',
          });

          touch(key);
        },
      });
    }

    section.querySelector('[data-hl-save]')?.addEventListener('click', () => save(key));
  });
}

/**
 * Drag a row to reorder it.
 *
 * The arrows stay and are not a fallback — they are the only way this works on
 * a touch screen or from a keyboard, and eight products is four taps rather
 * than a drag anyway. Dragging is for the case the arrows are bad at: moving
 * the ninth product to the top of the shelf.
 *
 * Reordering only, and only within one shelf. Dragging BETWEEN shelves reads
 * as though it should work and would then have to answer "did that move it or
 * copy it?" — the chips answer that question explicitly instead.
 */
function wireDrag(section, rail, key) {
  const list = section.querySelector('[data-hl-list]');
  if (!list || !list.matches('ol')) return;

  let fromIndex = -1;

  list.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.hlitem');
    if (!li) return;

    fromIndex = [...list.children].indexOf(li);

    li.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    // Firefox will not start a drag without this, even unused.
    e.dataTransfer.setData('text/plain', String(fromIndex));
  });

  list.addEventListener('dragend', () => {
    list.querySelectorAll('.is-dragging, .is-over')
      .forEach((el) => el.classList.remove('is-dragging', 'is-over'));
  });

  list.addEventListener('dragover', (e) => {
    if (fromIndex < 0) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const li = e.target.closest('.hlitem');
    if (!li) return;

    list.querySelectorAll('.is-over').forEach((el) => el.classList.remove('is-over'));
    li.classList.add('is-over');
  });

  list.addEventListener('drop', (e) => {
    if (fromIndex < 0) return;

    e.preventDefault();

    const li = e.target.closest('.hlitem');
    if (!li) return;

    const toIndex = [...list.children].indexOf(li);

    if (toIndex !== -1 && toIndex !== fromIndex) {
      rail.items.splice(toIndex, 0, ...rail.items.splice(fromIndex, 1));
      touch(key);
    }

    fromIndex = -1;
  });
}

/** Redraw after a local edit, and remember the shelf needs saving. */
function touch(key) {
  dirty.add(key);
  paint();   // paint() ends in paintSaveBar(), so the bar follows the set

  const section = document.querySelector(`[data-hl-rail="${CSS.escape(key)}"]`);
  section.querySelector('[data-hl-save]').disabled = false;
  section.querySelector('[data-hl-state]').textContent = 'not saved yet';
  section.classList.add('is-dirty');
}

function swap(arr, a, b) {
  [arr[a], arr[b]] = [arr[b], arr[a]];
}

async function save(key) {
  const rail = rails.find((r) => r.rail === key);
  const section = document.querySelector(`[data-hl-rail="${CSS.escape(key)}"]`);
  const btn = section.querySelector('[data-hl-save]');
  const state = section.querySelector('[data-hl-state]');

  btn.disabled = true;
  state.textContent = 'saving…';

  let result;
  try {
    result = await adminFetch(`/highlights/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus: rail.items.map((i) => i.sku) }),
    });
  } catch (err) {
    btn.disabled = false;
    state.textContent = '';
    return note(err.message, false);
  }

  dirty.delete(key);
  section.classList.remove('is-dirty');
  state.textContent = 'saved';
  paintSaveBar();
  note(`${rail.label}: ${result.message}`, true);

  // Reload only this shelf's truth from the server — the "not on the site"
  // reasons are computed there and a local guess would go stale.
  setTimeout(() => { if (!dirty.size) load(); }, 600);
}

function note(message, ok) {
  const el = document.querySelector('[data-hl-note]');
  el.textContent = message;
  el.hidden = false;
  el.style.background = ok ? 'rgba(46,160,67,.10)' : '';
  el.style.color = ok ? '#1a7f37' : '';
}
