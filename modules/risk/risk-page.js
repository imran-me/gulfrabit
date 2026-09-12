/**
 * risk-page.js — the Delivery risk screen.
 *
 * Two reads: the shop's own record for the chosen window, and one phone at a
 * time when somebody pastes a number in. Nothing is computed here — the band,
 * the reason and every rate arrive from the server, so the sentence a packer
 * acts on is the same sentence the next screen would print.
 */

import { adminFetch } from '../admin/backend/api.js';
import { escapeHtml } from '../admin/admin-shell.js';

const $ = (sel) => document.querySelector(sel);

/**
 * The bands, as the words the screen shows. The word carries the meaning and
 * the colour only reinforces it — this is a judgement about somebody's
 * history, and a colour alone deciding whether a parcel goes out would be
 * indefensible.
 */
const BANDS = {
  new: { word: 'New customer', short: 'New' },
  good: { word: 'Good record', short: 'Good' },
  ok: { word: 'Normal', short: 'Normal' },
  watch: { word: 'Call before dispatch', short: 'Worth a call' },
  risky: { word: 'Ask for payment first', short: 'Risky' },
};

const STATUS_WORDS = {
  delivered: 'Delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
  spam: 'Marked fake',
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  ready_for_courier: 'Ready for courier',
  shipped: 'Shipped',
};

document.addEventListener('admin:ready', init);

function init() {
  const days = $('[data-rk-days]');
  if (!days) return;

  const fromUrl = new URLSearchParams(location.search).get('days');
  if (fromUrl && days.querySelector(`option[value="${fromUrl}"]`)) days.value = fromUrl;

  days.addEventListener('change', load);

  $('[data-rk-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    check($('[data-rk-phone]').value);
  });

  // Delegated: the watchlist is repainted on every period change.
  $('[data-rk-watch]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rk-lookup]');
    if (!btn) return;
    $('[data-rk-phone]').value = btn.dataset.rkLookup;
    check(btn.dataset.rkLookup);
    $('[data-rk-phone]').scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  load();
}

/* ---- the shop's own record --------------------------------------------- */

async function load() {
  const days = $('[data-rk-days]').value;
  history.replaceState(null, '', days === '90' ? location.pathname : `?days=${days}`);

  let payload;
  try {
    payload = await adminFetch(`/risk?days=${encodeURIComponent(days)}`);
  } catch (err) {
    return fail(err);
  }

  $('[data-rk-error]').hidden = true;
  paintShop(payload.data.shop);
  paintDistricts(payload.data.shop);
  paintWatchlist(payload.data.watchlist);
}

function paintShop(s) {
  const host = $('[data-rk-shop]');

  if (!s.decided) {
    host.innerHTML = `<p class="rkempty">No parcel has been decided yet in this window —
      nothing delivered, returned or cancelled. The numbers appear as orders complete.</p>`;
    return;
  }

  const okPct = Math.round((s.delivered / s.decided) * 100);

  host.innerHTML = `
    <p class="rkhero">
      <span class="rkhero__n">${okPct}%</span>
      <span class="rkhero__l">of decided parcels were accepted</span>
    </p>
    <div class="rkbar" role="img" aria-label="${escapeHtml(`${s.delivered} accepted, ${s.failed} came back`)}">
      <span class="rkbar__seg rkbar__seg--ok" style="flex-grow:${s.delivered}"></span>
      ${s.failed ? `<span class="rkbar__seg rkbar__seg--bad" style="flex-grow:${s.failed}"></span>` : ''}
    </div>
    <ul class="rklegend">
      <li><span class="rklegend__swatch rklegend__swatch--ok" aria-hidden="true"></span>${num(s.delivered)} accepted · ${taka(s.deliveredTaka)}</li>
      <li><span class="rklegend__swatch rklegend__swatch--bad" aria-hidden="true"></span>${num(s.failed)} came back · ${taka(s.lostTaka)} not earned</li>
    </ul>
    <ul class="rkcounts">
      <li><b>${num(s.orders)}</b> orders in the window</li>
      <li><b>${num(s.pending)}</b> still with the courier</li>
      <li><b>${s.failedPct == null ? '—' : `${s.failedPct}%`}</b> came back</li>
    </ul>
    ${paymentSplit(s.payments ?? [])}`;
}

/**
 * Cash on delivery against everything else — the comparison that says whether
 * asking for advance payment would actually change anything.
 */
function paymentSplit(payments) {
  const known = payments.filter((p) => p.delivered + p.failed >= 3);
  if (known.length < 2) return '';

  return `<ul class="rkcounts">${known.map((p) => `
    <li><b>${p.failedPct == null ? '—' : `${p.failedPct}%`}</b> came back — ${escapeHtml(p.method === 'cod' ? 'cash on delivery' : p.method)}</li>
  `).join('')}</ul>`;
}

function paintDistricts(s) {
  const host = $('[data-rk-districts]');
  const rows = s.districts ?? [];

  if (!rows.length) {
    host.innerHTML = '<p class="rkempty">Not enough decided parcels in any one district yet.</p>';
    return;
  }

  host.innerHTML = `<div class="atable-wrap"><table class="atable atable--tight">
    <thead><tr>
      <th scope="col">District</th>
      <th scope="col" class="atable__num">Parcels</th>
      <th scope="col" class="atable__num">Came back</th>
      <th scope="col" class="atable__num">Value lost</th>
    </tr></thead>
    <tbody>${rows.map((d) => `
      <tr>
        <td>${escapeHtml(d.district)}</td>
        <td class="atable__num">${num(d.delivered + d.failed)}</td>
        <td class="atable__num">${d.failedPct != null && d.failedPct >= 25
          ? `<span class="rkband rkband--risky">${d.failedPct}%</span>`
          : `${d.failedPct ?? 0}%`}</td>
        <td class="atable__num">${d.lostTaka ? taka(d.lostTaka) : '—'}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function paintWatchlist(w) {
  const body = $('[data-rk-watch]');
  const rows = w.rows ?? [];

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="10" class="atable__empty">
      No number has had a parcel come back in this window. Nothing to watch.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((r) => `
    <tr>
      <td><span class="rkphone">${escapeHtml(r.phone)}</span></td>
      <td>${escapeHtml(r.name ?? '—')}</td>
      <td>${band(r.band)}</td>
      <td class="atable__num">${num(r.orders)}</td>
      <td class="atable__num">${num(r.delivered)}</td>
      <td class="atable__num">${num(r.failed)}${r.failedPct != null ? `<span class="atable__sub">${r.failedPct}%</span>` : ''}</td>
      <td class="atable__num">${taka(r.lostTaka)}</td>
      <td class="rkmuted">${escapeHtml((r.districts ?? []).join(', ') || '—')}</td>
      <td class="rkmuted">${escapeHtml(when(r.lastAt))}</td>
      <td><button type="button" class="btn-gr btn-gr--ghost" data-rk-lookup="${escapeHtml(r.phone)}">Check</button></td>
    </tr>`).join('');
}

/* ---- one number -------------------------------------------------------- */

async function check(phone) {
  const host = $('[data-rk-result]');
  const value = String(phone ?? '').trim();

  if (!value) {
    host.hidden = false;
    host.innerHTML = '<p class="rkempty">Type or paste the phone number from the order.</p>';
    return;
  }

  host.hidden = false;
  host.innerHTML = '<p class="rkempty">Reading this shop\'s orders…</p>';

  let payload;
  try {
    payload = await adminFetch(`/risk/phone?phone=${encodeURIComponent(value)}`);
  } catch (err) {
    host.innerHTML = `<p class="aerror">${escapeHtml(message(err))}</p>`;
    return;
  }

  paintVerdict(host, payload.data, value);
}

function paintVerdict(host, v, phone) {
  const b = BANDS[v.band] ?? BANDS.ok;

  host.innerHTML = `
    <div class="rkverdict rkverdict--${escapeHtml(v.band)}">
      <div class="rkverdict__head">
        <span class="rkverdict__band">${escapeHtml(b.word)}</span>
        <span class="rkverdict__phone">${escapeHtml(phone)}</span>
      </div>
      <p class="rkverdict__reason">${escapeHtml(v.reason)}</p>

      <ul class="rkcounts">
        <li><b>${num(v.delivered)}</b> accepted</li>
        <li><b>${num(v.failed)}</b> came back</li>
        <li><b>${num(v.pending)}</b> on the way now</li>
        ${v.lostTaka ? `<li><b>${taka(v.lostTaka)}</b> did not become revenue</li>` : ''}
        ${v.spentTaka ? `<li><b>${taka(v.spentTaka)}</b> actually paid over time</li>` : ''}
      </ul>

      ${v.orders?.length ? orderTable(v.orders) : ''}
    </div>`;
}

function orderTable(orders) {
  return `<div class="atable-wrap rktable"><table class="atable atable--tight">
    <thead><tr>
      <th scope="col">Order</th>
      <th scope="col">What happened</th>
      <th scope="col" class="atable__num">Value</th>
      <th scope="col">District</th>
      <th scope="col">Paid by</th>
      <th scope="col">When</th>
    </tr></thead>
    <tbody>${orders.map((o) => `
      <tr>
        <td><a href="/admin/order?no=${encodeURIComponent(o.orderNumber)}">${escapeHtml(o.orderNumber)}</a></td>
        <td>${statusPill(o.status)}</td>
        <td class="atable__num">${taka(o.taka)}</td>
        <td>${escapeHtml(o.district ?? '—')}</td>
        <td>${escapeHtml(o.payment === 'cod' ? 'cash on delivery' : (o.payment ?? '—'))}</td>
        <td class="rkmuted">${escapeHtml(when(o.at))}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function statusPill(status) {
  const word = STATUS_WORDS[status] ?? status;
  const tone = status === 'delivered' ? 'ok'
    : ['returned', 'cancelled', 'spam'].includes(status) ? 'bad'
      : 'wait';

  return `<span class="apill apill--${tone} apill--label">${escapeHtml(word)}</span>`;
}

function band(key) {
  const b = BANDS[key] ?? BANDS.ok;
  return `<span class="rkband rkband--${escapeHtml(key)}">${escapeHtml(b.short)}</span>`;
}

/* ---- pieces ------------------------------------------------------------ */

function fail(err) {
  const box = $('[data-rk-error]');
  box.hidden = false;
  box.textContent = message(err);
  $('[data-rk-shop]').innerHTML = '';
  $('[data-rk-districts]').innerHTML = '';
  $('[data-rk-watch]').innerHTML = '';
}

function message(err) {
  if (err?.status === 404 || !err?.status) {
    return 'No backend answered. This screen reads the orders table, so it fills as soon as the API is live.';
  }
  if (err.status === 403) return 'This account cannot see order history.';
  return err.message || 'Something went wrong reading the orders.';
}

function num(n) { return new Intl.NumberFormat('en-BD').format(n ?? 0); }
function taka(n) { return `৳ ${num(Math.round(n ?? 0))}`; }

function when(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).replace(' ', 'T'));
  return Number.isNaN(+d) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}
