/**
 * analytics-page.js — the Tracking screen.
 *
 * Read-only. It holds one piece of state, the slice being looked at: the
 * period, and optionally a channel, a device and a campaign. That slice lives
 * in the URL, so a bookmarked "last 30 days, Meta ads, phones" opens on
 * exactly that, and it is sent unchanged to every endpoint — which is what
 * makes the headline, the chart and each tab agree about the same visits.
 *
 * ONE TAB AT A TIME. The overview paints first and each tab fetches when it is
 * opened, because a merchant checking this morning's orders should not wait
 * for the product report to be computed. Answers are cached per slice, so
 * going back to a tab is instant and changing the period drops the lot.
 *
 * NOTHING NUMERIC IS DERIVED HERE. Every rate and percentage arrives computed
 * by the server. If this screen and the CSV export ever disagreed about a
 * drop-off, the cause would be a second definition living in the browser, so
 * there is deliberately only one.
 */

import { adminFetch } from '../admin/backend/api.js';
import { setLabels, escapeHtml, num, ago } from './tracker/format.js';
import { hideTip } from './tracker/charts.js';
import { paintOverview, paintTrend, paintInsights } from './tracker/overview.js';
import { paintLive } from './tracker/live.js';
import { paintSources } from './tracker/sources.js';
import { paintAudience } from './tracker/audience.js';
import { paintProducts } from './tracker/products.js';
import { paintSearch } from './tracker/search.js';
import { paintCheckout } from './tracker/checkout.js';
import { paintVisits, appendVisits } from './tracker/visits.js';
import { paintFootprint } from './tracker/footprint.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const TABS = ['overview', 'live', 'sources', 'audience', 'products', 'search', 'checkout', 'visits'];

/** How often each tab is worth re-reading while auto-refresh is on. */
const LIVE_MS = 10000;
const REFRESH_MS = 60000;
const PAGE = 50;

const state = {
  tab: 'overview',
  period: '7d',
  from: '',
  to: '',
  channel: '',
  device: '',
  campaign: '',
  metric: 'sessions',
  sort: 'views',
  outcome: '',
  auto: false,
  visitsShown: 0,
};

/** Answers per slice, so returning to a tab does not refetch it. */
const cache = new Map();
let overview = null;
let timer = null;

document.addEventListener('admin:ready', init);

function init() {
  if (!$('[data-t-filters]')) return;

  readUrl();
  wireFilters();
  wireTabs();
  wireDrawer();

  // One delegated listener for the whole screen: every table is repainted on
  // every filter change, and per-row handlers would leak with each repaint.
  $('.admin__main')?.addEventListener('click', (e) => {
    const visit = e.target.closest('[data-session]');
    if (visit && visit.dataset.session) { openFootprint(visit.dataset.session); return; }

    const goto = e.target.closest('[data-goto-tab]');
    if (goto) { showTab(goto.dataset.gotoTab); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer(); else startTimer();
  });

  window.addEventListener('beforeunload', stopTimer);

  load();
}

/* ---- the slice --------------------------------------------------------- */

function readUrl() {
  const q = new URLSearchParams(location.search);
  const tab = q.get('tab');
  if (TABS.includes(tab)) state.tab = tab;
  for (const key of ['period', 'from', 'to', 'channel', 'device', 'campaign']) {
    const v = q.get(key);
    if (v) state[key] = v;
  }
}

function writeUrl() {
  const q = new URLSearchParams();
  if (state.tab !== 'overview') q.set('tab', state.tab);
  if (state.period !== '7d') q.set('period', state.period);
  if (state.period === 'custom') {
    if (state.from) q.set('from', state.from);
    if (state.to) q.set('to', state.to);
  }
  for (const key of ['channel', 'device', 'campaign']) {
    if (state[key]) q.set(key, state[key]);
  }
  const qs = q.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

/** The slice as a query string — the same one every endpoint receives. */
function slice() {
  const q = new URLSearchParams({ period: state.period });
  if (state.period === 'custom') {
    if (state.from) q.set('from', state.from);
    if (state.to) q.set('to', state.to);
  }
  for (const key of ['channel', 'device', 'campaign']) {
    if (state[key]) q.set(key, state[key]);
  }
  return q.toString();
}

/* ---- filters ----------------------------------------------------------- */

function wireFilters() {
  const period = $('[data-t-period]');
  period.value = state.period;
  $('[data-t-from]').value = state.from;
  $('[data-t-to]').value = state.to;
  toggleRange();

  period.addEventListener('change', () => {
    state.period = period.value;
    toggleRange();
    // A custom range with no dates yet would ask the server for nothing;
    // wait until both ends are set.
    if (state.period === 'custom' && !(state.from && state.to)) {
      $('[data-t-from]').focus();
      return;
    }
    reload();
  });

  for (const sel of ['[data-t-from]', '[data-t-to]']) {
    $(sel).addEventListener('change', () => {
      state.from = $('[data-t-from]').value;
      state.to = $('[data-t-to]').value;
      if (state.from && state.to) reload();
    });
  }

  for (const [sel, key] of [['[data-t-channel]', 'channel'], ['[data-t-device]', 'device'], ['[data-t-campaign]', 'campaign']]) {
    const el = $(sel);
    el.value = state[key];
    el.addEventListener('change', () => { state[key] = el.value; reload(); });
  }

  $('[data-t-clear]').addEventListener('click', () => {
    state.channel = state.device = state.campaign = '';
    $('[data-t-channel]').value = '';
    $('[data-t-device]').value = '';
    $('[data-t-campaign]').value = '';
    reload();
  });

  $('[data-t-auto]').addEventListener('change', (e) => {
    state.auto = e.target.checked;
    if (state.auto) startTimer(); else stopTimer();
  });

  // The trend's measure and the chart's table twin.
  $('[data-t-metric]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-metric]');
    if (!btn || !overview) return;
    state.metric = btn.dataset.metric;
    $$('[data-t-metric] [data-metric]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    paintTrend(document, overview, state.metric);
  });

  const toggle = $('[data-t-trend-table]');
  toggle?.addEventListener('click', () => {
    const wrap = $('[data-t-trend-tablewrap]');
    const open = wrap.hidden;
    wrap.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.textContent = open ? 'Hide the table' : 'Show as a table';
  });
}

function toggleRange() {
  const custom = state.period === 'custom';
  $$('[data-t-range]').forEach((el) => { el.hidden = !custom; });
}

function paintFilterOptions(options) {
  const channel = $('[data-t-channel]');
  const campaign = $('[data-t-campaign]');
  const labels = overview?.labels?.channels ?? {};

  if (channel.dataset.filled !== '1' || channel.options.length <= 1) {
    channel.innerHTML = `<option value="">All channels</option>${(options.channels ?? [])
      .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(labels[k] ?? k)}</option>`).join('')}`;
    channel.value = state.channel;
    channel.dataset.filled = '1';
  }

  if (campaign.dataset.filled !== '1' || campaign.options.length <= 2) {
    campaign.innerHTML = `<option value="">All campaigns</option><option value="(none)">No campaign tag</option>${
      (options.campaigns ?? []).map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}`;
    campaign.value = state.campaign;
    campaign.dataset.filled = '1';
  }

  $('[data-t-clear]').hidden = !(state.channel || state.device || state.campaign);
}

/* ---- tabs -------------------------------------------------------------- */

function wireTabs() {
  $$('[data-t-tab]').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tTab));
    btn.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(btn.dataset.tTab);
      const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
      if (next === null) return;
      e.preventDefault();
      const tab = TABS[(next + TABS.length) % TABS.length];
      $(`[data-t-tab="${tab}"]`)?.focus();
      showTab(tab);
    });
  });
  showTab(state.tab, true);
}

function showTab(tab, quiet = false) {
  if (!TABS.includes(tab)) return;
  state.tab = tab;

  $$('[data-t-tab]').forEach((b) => {
    const on = b.dataset.tTab === tab;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
  $$('[data-t-panel]').forEach((p) => { p.hidden = p.dataset.tPanel !== tab; });

  writeUrl();
  hideTip();
  if (!quiet) loadTab();
  startTimer();
}

/* ---- loading ----------------------------------------------------------- */

function reload() {
  cache.clear();
  overview = null;
  writeUrl();
  load();
}

async function load() {
  const qs = slice();
  const exp = $('[data-t-export]');
  if (exp) exp.href = `/api/admin/marketing/analytics/export?${qs}`;

  busy('overview', true);
  let payload;
  try {
    payload = await adminFetch(`/marketing/analytics?${qs}`);
  } catch (err) {
    return fail(err);
  } finally {
    busy('overview', false);
  }

  overview = payload.data;
  setLabels(overview.labels);
  $('[data-t-error]').hidden = true;

  paintHead(overview);
  paintFilterOptions(overview.options ?? {});
  paintOverview(document, overview, state.metric);

  loadInsights(qs);
  loadTab();
}

async function loadInsights(qs) {
  const host = $('[data-t-insights]');
  try {
    const payload = await adminFetch(`/marketing/analytics/insights?${qs}`);
    paintInsights(host, payload.data.insights ?? []);
  } catch {
    // The panel is a bonus on top of numbers that are already on screen; a
    // failure here must not replace them with a red box.
    host.innerHTML = '<p class="tempty">Could not read the findings for this period.</p>';
  }
}

/** Each tab's endpoint, painter, and where its markup goes. */
const LOADERS = {
  live: { path: 'live', paint: paintLive },
  sources: { path: 'sources', paint: paintSources },
  audience: { path: 'audience', paint: paintAudience },
  products: { path: 'products', paint: paintProducts, extra: () => `&sort=${encodeURIComponent(state.sort)}` },
  search: { path: 'search', paint: paintSearch },
  checkout: { path: 'checkout', paint: paintCheckout },
};

async function loadTab(force = false) {
  const tab = state.tab;
  if (tab === 'overview') return;
  if (tab === 'visits') return loadVisits(false);

  const loader = LOADERS[tab];
  const host = $(`[data-t-panel="${tab}"] [data-t-body]`);
  const qs = slice() + (loader.extra ? loader.extra() : '');
  const key = `${tab}|${qs}`;

  if (!force && cache.has(key)) {
    loader.paint(host, cache.get(key));
    afterPaint(tab, host);
    return;
  }

  if (!host.dataset.painted) host.innerHTML = '<p class="tempty">Reading…</p>';
  busy(tab, true);

  try {
    const payload = await adminFetch(`/marketing/analytics/${loader.path}?${qs}`);
    cache.set(key, payload.data);
    loader.paint(host, payload.data);
    host.dataset.painted = '1';
    afterPaint(tab, host);
  } catch (err) {
    host.innerHTML = `<p class="aerror">${escapeHtml(message(err))}</p>`;
  } finally {
    busy(tab, false);
  }
}

/** Tab-specific wiring that only exists once its markup has been painted. */
function afterPaint(tab, host) {
  if (tab === 'live') {
    const count = $('[data-t-live-count]');
    if (count) {
      count.hidden = false;
      count.textContent = num(cache.get(`live|${slice()}`)?.active ?? 0);
    }
  }

  if (tab === 'products') {
    host.querySelector('[data-t-product-sort]')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sort]');
      if (!btn) return;
      state.sort = btn.dataset.sort;
      loadTab();
    });
  }
}

async function loadVisits(append) {
  const host = $('[data-t-panel="visits"] [data-t-body]');
  const qs = `${slice()}&limit=${PAGE}&offset=${append ? state.visitsShown : 0}`
    + (state.outcome ? `&outcome=${encodeURIComponent(state.outcome)}` : '');

  if (!append) state.visitsShown = 0;
  busy('visits', true);

  try {
    const payload = await adminFetch(`/marketing/analytics/sessions?${qs}`);
    const rows = payload.data ?? [];
    state.visitsShown += rows.length;

    if (append) {
      appendVisits(host, rows);
      const more = host.querySelector('[data-t-more]');
      if (more) more.hidden = rows.length < PAGE;
    } else {
      paintVisits(host, rows, { outcome: state.outcome, more: rows.length >= PAGE });
      host.querySelector('[data-t-outcome]')?.addEventListener('change', (e) => {
        state.outcome = e.target.value;
        loadVisits(false);
      });
      host.querySelector('[data-t-more]')?.addEventListener('click', () => loadVisits(true));
    }
  } catch (err) {
    host.innerHTML = `<p class="aerror">${escapeHtml(message(err))}</p>`;
  } finally {
    busy('visits', false);
  }
}

/* ---- the head and its health strip ------------------------------------- */

function paintHead(d) {
  const f = d.filter ?? {};
  const k = d.kpis ?? {};

  $('[data-t-sub]').textContent = `${num(d.events)} events from ${num(k.visitors?.value)} `
    + `visitor${k.visitors?.value === 1 ? '' : 's'} · ${f.label ?? ''}`
    + (f.segmented ? ' · filtered' : '');

  const h = d.health ?? {};
  const capi = d.capi ?? {};
  const chips = [];

  if (h.lastEventAgoSeconds == null) {
    chips.push(['warn', 'No events recorded yet']);
  } else if (h.lastEventAgoSeconds > 6 * 3600) {
    chips.push(['bad', `Last event ${ago(h.lastEventAgoSeconds)} — tracking may have stopped`]);
  } else {
    chips.push(['ok', `Tracking live · last event ${ago(h.lastEventAgoSeconds)}`]);
  }

  if (capi.failed > 0) {
    chips.push(['bad', `Conversions API failing (${num(capi.failed)} refused)`]);
  } else if (capi.sent > 0) {
    chips.push(['ok', `Conversions API sending (${num(capi.sent)})`]);
  } else {
    chips.push(['warn', 'Conversions API off — browser pixel only']);
  }

  chips.push(['', `${num(h.events24h)} events in the last 24 hours`]);
  chips.push(['', `Compared with ${f.compareLabel ?? '—'} (${f.prevFrom ?? ''} to ${f.prevTo ?? ''})`]);

  $('[data-t-health]').innerHTML = chips.map(([tone, text]) =>
    `<span class="tchip${tone ? ` tchip--${tone}` : ''}">${escapeHtml(text)}</span>`).join('');
}

/* ---- the footprint drawer ---------------------------------------------- */

function wireDrawer() {
  const drawer = $('[data-t-drawer]');
  $('[data-t-drawer-close]')?.addEventListener('click', () => drawer.close());
  // The backdrop is part of the dialog's own box, so a click outside the
  // panel lands on the dialog itself.
  drawer?.addEventListener('click', (e) => { if (e.target === drawer) drawer.close(); });
}

async function openFootprint(sessionId) {
  const drawer = $('[data-t-drawer]');
  const body = $('[data-t-drawer-body]');
  const sub = $('[data-t-drawer-sub]');

  body.innerHTML = '<p class="tempty">Reading this visit…</p>';
  if (sub) sub.textContent = `Visit ${sessionId.slice(0, 8)}…`;
  if (!drawer.open) drawer.showModal();

  try {
    const payload = await adminFetch(`/marketing/analytics/sessions/${encodeURIComponent(sessionId)}`);
    paintFootprint(body, sub, payload.data);
  } catch (err) {
    body.innerHTML = `<p class="aerror">${escapeHtml(message(err))}</p>`;
  }
}

/* ---- refreshing -------------------------------------------------------- */

function startTimer() {
  stopTimer();
  if (document.hidden) return;
  // The live tab refreshes on its own: watching it IS the point of it. Every
  // other tab only moves when the merchant asks for it.
  const on = state.tab === 'live' || state.auto;
  if (!on) return;

  timer = setInterval(() => {
    if (state.tab === 'live') loadTab(true);
    else load();
  }, state.tab === 'live' ? LIVE_MS : REFRESH_MS);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * While a panel reloads it holds its last render at reduced opacity — no
 * skeleton, no jump. A screen that empties itself every thirty seconds cannot
 * be read while it refreshes.
 */
function busy(tab, on) {
  const panel = tab === 'overview' ? $('[data-t-panel="overview"]') : $(`[data-t-panel="${tab}"]`);
  if (!panel) return;
  panel.classList.toggle('is-loading', on);
  panel.setAttribute('aria-busy', on ? 'true' : 'false');
}

function message(err) {
  if (err?.status === 404 || !err?.status) {
    return 'No backend answered. Tracking appears once the API is live and its migrations have run on the server.';
  }
  if (err.status === 403) return 'This account cannot see the shop\'s revenue data.';
  return err.message || 'Something went wrong reading this report.';
}

function fail(err) {
  const box = $('[data-t-error]');
  box.hidden = false;
  box.textContent = message(err);
  $('[data-t-kpis]').innerHTML = '';
  $('[data-t-funnel]').innerHTML = '';
  $('[data-t-insights]').innerHTML = '';
}
