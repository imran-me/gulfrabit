/**
 * orders-page.js — the order list, worked as a pipeline.
 *
 * Filter state lives in the URL, not in a variable. A colleague asking "which
 * orders are stuck in packing?" should be answerable by sending them a link,
 * and a reloaded page should not silently drop back to showing everything.
 *
 * THE STAGE BAR IS THE SCREEN
 * ---------------------------
 * The stage lives in a hidden input rather than the dropdown it replaced,
 * because a shop does not think "filter by status" — it thinks "who have I not
 * called yet, what is waiting to be packed, what is at the door". Those are
 * places, and a tab bar is what places look like. The dropdown was the same
 * data asking to be searched instead of walked.
 *
 * The counts come from the server with the rows, under the same search, so the
 * bar reads as an answer to the current question and not to a different one.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { STAGES, stageLabel, stageTone } from './order-stages.js';

const FILTER_KEYS = ['q', 'status', 'paymentStatus', 'from', 'to'];
let page = 1;

document.addEventListener('admin:ready', init);

function init() {
  const form = document.querySelector('[data-orders-filters]');
  if (!form) return;

  paintTabs({});   // drawn immediately, counts filled in when they arrive

  // Restore from the URL so a shared or bookmarked link opens the same view.
  const params = new URLSearchParams(location.search);
  FILTER_KEYS.forEach((k) => { if (params.has(k) && form[k]) form[k].value = params.get(k); });
  page = Math.max(1, Number(params.get('page')) || 1);

  form.addEventListener('submit', (e) => { e.preventDefault(); page = 1; load(); });
  document.querySelector('[data-orders-clear]')?.addEventListener('click', () => {
    form.reset();
    // reset() does not clear a hidden input's value the way it clears a visible
    // one — it restores the DEFAULT attribute, which is empty here, so the
    // stage genuinely goes back to "all". Stated because it looks like a bug.
    form.status.value = '';
    page = 1;
    load();
  });
  document.querySelector('[data-page-prev]')?.addEventListener('click', () => { page--; load(); });
  document.querySelector('[data-page-next]')?.addEventListener('click', () => { page++; load(); });

  // One listener on the bar rather than one per tab: the bar is repainted with
  // every load, and handlers attached to buttons that get replaced are handlers
  // that quietly stop working.
  document.querySelector('[data-orders-tabs]')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-stage]');
    if (!tab) return;
    form.status.value = tab.dataset.stage;
    page = 1;
    load();
  });

  load();
}

function currentFilters() {
  const form = document.querySelector('[data-orders-filters]');
  const out = {};
  FILTER_KEYS.forEach((k) => {
    const v = form[k]?.value.trim();
    if (v) out[k] = v;
  });
  return out;
}

/**
 * The stage bar. `all` first, then the pipeline in working order.
 *
 * Counts are rendered as a separate element and not baked into the label, so a
 * screen reader announces "Placed, 4 orders" rather than "Placed4".
 */
function paintTabs(counts) {
  const host = document.querySelector('[data-orders-tabs]');
  if (!host) return;

  const current = document.querySelector('[data-orders-filters]')?.status.value || '';
  const tabs = [{ key: '', label: 'All orders' }, ...STAGES];

  host.innerHTML = tabs.map(({ key, label }) => {
    const n = counts[key || 'all'];
    const on = key === current;
    return `
      <button class="atab${on ? ' is-on' : ''}" type="button" data-stage="${key}"
              aria-current="${on ? 'page' : 'false'}">
        ${escapeHtml(label)}${
          // No badge at all until the numbers land, rather than a flash of
          // zeroes that then corrects itself — a "0" that turns into "7" reads
          // as the screen having been wrong.
          n === undefined ? '' : `<span class="atab__count">${n.toLocaleString('en-BD')}</span>`
        }
      </button>`;
  }).join('');
}

async function load() {
  const body = document.querySelector('[data-orders-body]');
  const filters = currentFilters();

  // Mirror to the URL before fetching, so the address bar is right even if the
  // request is slow or fails.
  const qs = new URLSearchParams(filters);
  if (page > 1) qs.set('page', String(page));
  history.replaceState(null, '', qs.toString() ? `?${qs}` : location.pathname);

  body.innerHTML = `<tr><td colspan="8" class="atable__empty">Loading…</td></tr>`;

  let payload;
  try {
    payload = await adminFetch(`/orders?${new URLSearchParams({ ...filters, page: String(page) })}`);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="8" class="atable__empty">${
      err.status === 404 || !err.status
        ? 'No backend connected yet — orders appear once the API is live.'
        : escapeHtml(err.message)
    }</td></tr>`;
    document.querySelector('[data-orders-count]').textContent = '';
    document.querySelector('[data-orders-pager]').hidden = true;
    return;
  }

  paint(payload);
}

function paint({ data, meta }) {
  const body = document.querySelector('[data-orders-body]');
  const count = document.querySelector('[data-orders-count]');

  paintTabs(meta.counts || {});

  const stage = document.querySelector('[data-orders-filters]').status.value;
  count.textContent = meta.total === 0
    ? 'No orders match these filters.'
    : `${meta.total.toLocaleString('en-BD')} order${meta.total === 1 ? '' : 's'}${
        stage ? ` in ${stageLabel(stage).toLowerCase()}` : ''
      }`;

  if (!data.length) {
    // Named, because an empty stage is usually good news. "Nothing here" makes
    // an empty Placed tab look like a broken screen when it means every order
    // has been called.
    body.innerHTML = `<tr><td colspan="8" class="atable__empty">${
      stage
        ? `Nothing in ${escapeHtml(stageLabel(stage).toLowerCase())} right now.`
        : 'Nothing here. Try widening the filters.'
    }</td></tr>`;
    document.querySelector('[data-orders-pager]').hidden = true;
    return;
  }

  body.innerHTML = data.map((o) => `
    <tr>
      <td><a href="/modules/admin/order.html?no=${encodeURIComponent(o.orderNumber)}">${escapeHtml(o.orderNumber)}</a></td>
      <td>
        <div>${escapeHtml(o.customerName)}</div>
        <div class="atable__sub">${escapeHtml(o.customerPhone)}</div>
      </td>
      <td>${escapeHtml(o.district || '—')}</td>
      <td class="atable__num">${o.itemCount}</td>
      <td class="atable__num">৳ ${Number(o.totalTaka).toLocaleString('en-BD')}</td>
      <td>${pill(o.paymentStatus, paymentTone(o.paymentStatus))}</td>
      <td>${pill(stageLabel(o.status), stageTone(o.status), true)}</td>
      <td class="atable__sub">${formatWhen(o.placedAt)}</td>
    </tr>`).join('');

  const pager = document.querySelector('[data-orders-pager]');
  pager.hidden = meta.lastPage <= 1;
  document.querySelector('[data-page-label]').textContent = `Page ${meta.currentPage} of ${meta.lastPage}`;
  document.querySelector('[data-page-prev]').disabled = meta.currentPage <= 1;
  document.querySelector('[data-page-next]').disabled = meta.currentPage >= meta.lastPage;
}

/* Tone carries meaning that colour alone would not: the label is always the
   word, so this is reinforcement rather than the only signal. Order stages get
   theirs from order-stages.js, next to their labels. */
function paymentTone(s) {
  if (s === 'paid') return 'ok';
  if (s === 'failed') return 'bad';
  if (s === 'refunded') return 'info';
  return 'wait';
}
/**
 * `asIs` for text that is already a written phrase — a stage label like "Ready
 * for courier". Raw one-word values (a payment status) keep the stylesheet's
 * capitalisation instead of being title-cased here.
 */
function pill(text, tone, asIs = false) {
  return `<span class="apill${asIs ? ' apill--label' : ''} apill--${tone}">${escapeHtml(text)}</span>`;
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
