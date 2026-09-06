/**
 * analytics-page.js — the pixel dashboard.
 *
 * Read-only. The one piece of state is the period, kept in the URL so a
 * bookmarked "last 30 days" reopens as last 30 days — the same contract the
 * campaigns screen already uses, so the two behave identically.
 *
 * Everything numeric arrives already computed by AnalyticsService. Nothing here
 * derives a rate or a percentage: if the screen and an export ever disagreed
 * about a drop-off, the cause would be a second definition living in the
 * browser, so there is deliberately only one.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

const $ = (sel) => document.querySelector(sel);

document.addEventListener('admin:ready', init);

function init() {
  const days = $('[data-an-days]');
  if (!days) return;

  const fromUrl = new URLSearchParams(location.search).get('days');
  if (fromUrl && days.querySelector(`option[value="${fromUrl}"]`)) days.value = fromUrl;

  days.addEventListener('change', load);
  $('[data-an-fp-close]')?.addEventListener('click', closeFootprint);

  // One delegated listener rather than one per row: the table is repainted on
  // every period change, and per-row handlers would leak with each repaint.
  $('[data-an-visits]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-session]');
    if (btn) openFootprint(btn.dataset.session);
  });

  load();
}

function period() {
  return $('[data-an-days]').value;
}

async function load() {
  const days = period();
  history.replaceState(null, '', days === '7' ? location.pathname : `?days=${days}`);

  // The export href follows the period, so the file always matches the screen.
  const exp = $('[data-an-export]');
  if (exp) exp.href = `/api/admin/marketing/analytics/export?days=${encodeURIComponent(days)}`;

  closeFootprint();

  let payload;
  try {
    payload = await adminFetch(`/marketing/analytics?days=${encodeURIComponent(days)}`);
  } catch (err) {
    return fail(err);
  }

  paint(payload.data);
  loadVisits(days);
}

function fail(err) {
  const box = $('[data-an-error]');
  box.hidden = false;
  box.textContent = err.status === 404 || !err.status
    ? 'No backend connected yet — tracking appears once the API is live and the migration has run.'
    : err.message;
  $('[data-an-cards]').hidden = true;
  $('[data-an-funnel]').innerHTML = '';
}

function paint(d) {
  $('[data-an-error]').hidden = true;
  $('[data-an-cards]').hidden = false;

  setText('[data-an-visitors]', num(d.visitors));
  setText('[data-an-sessions]', num(d.sessions));
  setText('[data-an-purchases]', num(d.purchases));
  setText('[data-an-revenue]', `৳ ${num(d.revenueTaka)}`);
  setText('[data-an-sub]',
    `${num(d.events)} events from ${num(d.visitors)} visitor${d.visitors === 1 ? '' : 's'} in the last ${d.days} day${d.days === 1 ? '' : 's'}.`);

  paintFunnel(d.funnel);
  paintPages(d.topPages);
  paintCampaigns(d.campaigns);
  paintCapi(d.capi);
}

function paintFunnel(rows) {
  const host = $('[data-an-funnel]');

  if (!rows?.length || rows[0].sessions === 0) {
    host.innerHTML = '<p class="atable__empty">No visits recorded in this period yet.</p>';
    return;
  }

  host.innerHTML = rows.map((r) => {
    // Width is share OF THE TOP, so every bar is measured against the same
    // reference and the shape of the narrowing is readable at a glance.
    const width = r.ofTopPct ?? 0;

    // A drop-off is only worth colouring when it is worth acting on. Colouring
    // every one trains the eye to ignore the colour, which costs the merchant
    // the one row that actually mattered.
    const bad = r.dropOffPct !== null && r.dropOffPct >= 60;

    const note = r.dropOffPct === null
      ? '<span class="fnl__pct">the top of the funnel</span>'
      : `<span class="fnl__pct fnl__drop${bad ? ' fnl__drop--bad' : ''}">−${r.dropOffPct}% from previous</span>`;

    return `
      <div class="fnl__row">
        <span class="fnl__stage">${escapeHtml(label(r.stage))}</span>
        <div class="fnl__track">
          <div class="fnl__bar" style="width:${width}%"></div>
        </div>
        <span class="fnl__count"><b>${num(r.sessions)}</b> <span class="fnl__pct">${r.ofTopPct ?? 0}% of visits</span>${note}</span>
      </div>`;
  }).join('');
}

/** Meta's event names are not the words a shopkeeper uses. */
function label(stage) {
  return {
    PageView: 'Visited the shop',
    ViewContent: 'Opened a product',
    AddToCart: 'Added to cart',
    InitiateCheckout: 'Started checkout',
    Purchase: 'Ordered',
  }[stage] ?? stage;
}

function paintPages(rows) {
  const body = $('[data-an-pages]');
  body.innerHTML = rows?.length
    ? rows.map((p) => `
        <tr>
          <td>${escapeHtml(p.path || '—')}</td>
          <td class="atable__num">${num(p.sessions)}</td>
          <td class="atable__num">${num(p.views)}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" class="atable__empty">Nothing yet.</td></tr>';
}

function paintCampaigns(rows) {
  const body = $('[data-an-campaigns]');
  body.innerHTML = rows?.length
    ? rows.map((c) => `
        <tr>
          <td>${escapeHtml(c.utm_campaign || '(direct)')}${
            c.utm_source ? ` <span class="fnl__pct">${escapeHtml(c.utm_source)}</span>` : ''}</td>
          <td class="atable__num">${num(c.sessions)}</td>
          <td class="atable__num">${num(c.purchases)}</td>
          <td class="atable__num">৳ ${num(Math.round((c.revenue_poisha || 0) / 100))}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="atable__empty">Nothing yet.</td></tr>';
}

/**
 * Conversions API health, as a chip beside the subtitle.
 *
 * "skipped" is not a fault — it is the shipped state until a token is set — so
 * it reads as a neutral note rather than an error. Only a real failure is red.
 */
function paintCapi(c) {
  if (!c) return;
  const sub = $('[data-an-sub]');
  const total = c.sent + c.failed + c.skipped;
  if (!total) return;

  const chip = c.failed > 0
    ? `<span class="chip chip--bad">Conversions API failing (${num(c.failed)})</span>`
    : c.sent > 0
      ? `<span class="chip chip--ok">Conversions API sending</span>`
      : `<span class="chip chip--warn">Conversions API off — browser pixel only</span>`;

  sub.insertAdjacentHTML('beforeend', ` ${chip}`);
}

async function loadVisits(days) {
  const body = $('[data-an-visits]');
  let payload;
  try {
    payload = await adminFetch(`/marketing/analytics/sessions?days=${encodeURIComponent(days)}&limit=50`);
  } catch {
    body.innerHTML = '<tr><td colspan="6" class="atable__empty">Could not load visits.</td></tr>';
    return;
  }

  const rows = payload.data ?? [];
  body.innerHTML = rows.length
    ? rows.map((s) => `
        <tr>
          <td>${escapeHtml(when(s.started_at))}</td>
          <td>${escapeHtml(s.utm_campaign || s.utm_source || '(direct)')}</td>
          <td class="atable__num">${num(s.pages)}</td>
          <td>${furthest(s)}</td>
          <td class="atable__num">${s.revenue_poisha ? `৳ ${num(Math.round(s.revenue_poisha / 100))}` : '—'}</td>
          <td><button type="button" class="btn-gr btn-gr--ghost" data-session="${escapeHtml(s.session_id)}">Footprint</button></td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="atable__empty">No visits in this period.</td></tr>';
}

/**
 * How far a visit got, as a word.
 *
 * Read from the deepest step backwards, because a visit that bought also added
 * to cart — reported from the shallow end, every purchase would be labelled
 * "added to cart" and the column would be useless.
 */
function furthest(s) {
  if (+s.purchased) return '<span class="chip chip--ok">Ordered</span>';
  if (+s.reached_checkout) return '<span class="chip chip--warn">Checkout — no order</span>';
  if (+s.added_to_cart) return '<span class="chip">Cart — no checkout</span>';
  return '<span class="chip">Browsed only</span>';
}

async function openFootprint(sessionId) {
  const wrap = $('[data-an-fp-wrap]');
  const list = $('[data-an-fp]');
  wrap.hidden = false;
  list.innerHTML = '<li class="fp__item">Loading…</li>';
  setText('[data-an-fp-sub]', `Visit ${sessionId.slice(0, 8)}…`);
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

  let payload;
  try {
    payload = await adminFetch(`/marketing/analytics/sessions/${encodeURIComponent(sessionId)}`);
  } catch {
    list.innerHTML = '<li class="fp__item">Could not load this visit.</li>';
    return;
  }

  const rows = payload.data ?? [];
  setText('[data-an-fp-sub]',
    `${rows.length} step${rows.length === 1 ? '' : 's'} · visit ${sessionId.slice(0, 8)}…`);

  list.innerHTML = rows.map((e) => `
    <li class="fp__item">
      <span class="fp__time">${escapeHtml(clock(e.created_at))}</span>
      <span class="fp__ev">${escapeHtml(label(e.event_name))}</span>
      <span class="fp__path">${escapeHtml(e.content_name || e.path || '—')}</span>
      <span class="fp__val">${e.value_poisha ? `৳ ${num(Math.round(e.value_poisha / 100))}` : ''}</span>
    </li>`).join('') || '<li class="fp__item">Nothing recorded for this visit.</li>';
}

function closeFootprint() {
  const wrap = $('[data-an-fp-wrap]');
  if (wrap) wrap.hidden = true;
}

/* ---- formatting -------------------------------------------------------- */

function num(n) {
  return new Intl.NumberFormat('en-BD').format(n ?? 0);
}

function when(ts) {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T'));
  return Number.isNaN(+d) ? ts : d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function clock(ts) {
  if (!ts) return '—';
  const d = new Date(String(ts).replace(' ', 'T'));
  return Number.isNaN(+d) ? String(ts) : d.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function setText(sel, text) {
  const el = $(sel);
  if (el) el.textContent = text;
}
