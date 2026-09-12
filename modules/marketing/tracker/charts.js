/**
 * tracker/charts.js — the Tracking screen's charts, in plain SVG and HTML.
 *
 * No library. Five small forms, each chosen by what the numbers have to do:
 *
 *   trendChart  change over time, this period against the last — a line for
 *               each, ONE y-axis. Orders and visits are never drawn on the
 *               same plot: they differ by two orders of magnitude, and a
 *               second axis lets whoever picks the scales decide where the
 *               lines cross. The measure is chosen with a switch instead.
 *   sparkline   the trend inside a headline tile — shape, not values.
 *   columns     the last thirty minutes, one column a minute.
 *   heatmap     day of week × hour, one hue light to dark.
 *   barList     a ranked list — channels, browsers, districts — one hue for
 *               every bar, because those categories have no order and a
 *               colour per bar would re-encode the length it already shows.
 *
 * Every chart has a text route to its numbers: the trend has a table view,
 * the heatmap's cells carry their values for screen readers and the
 * keyboard, and the lists print their values beside the bars. The tooltip
 * adds; it never gates.
 */

import { escapeHtml } from './format.js';

/* ---- tooltip ---------------------------------------------------------- */

let tip = null;

function tipEl() {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'ttip';
    // Decorative duplicate of values the page already states elsewhere, so
    // it is hidden from assistive tech rather than announced on every move.
    tip.setAttribute('aria-hidden', 'true');
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  return tip;
}

/**
 * Show the tooltip near a point. `build` fills it with DOM nodes — text goes
 * in through textContent, because product names and campaign tags are typed
 * by people and must never be parsed as markup.
 */
export function showTip(x, y, build) {
  const el = tipEl();
  el.replaceChildren();
  build(el);
  el.hidden = false;

  const r = el.getBoundingClientRect();
  let left = x + 14;
  let top = y + 14;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}

export function hideTip() {
  if (tip) tip.hidden = true;
}

export function tipTitle(el, text) {
  const h = document.createElement('div');
  h.className = 'ttip__title';
  h.textContent = text;
  el.appendChild(h);
}

/** One line of the tooltip: the value strong, the name after it. */
export function tipRow(el, { value, label, key }) {
  const row = document.createElement('div');
  row.className = 'ttip__row';
  if (key) {
    const k = document.createElement('span');
    k.className = `ttip__key ttip__key--${key}`;
    row.appendChild(k);
  }
  const v = document.createElement('strong');
  v.textContent = value;
  row.appendChild(v);
  if (label) {
    const l = document.createElement('span');
    l.textContent = label;
    row.appendChild(l);
  }
  el.appendChild(row);
}

/* ---- scale ------------------------------------------------------------ */

/** A clean top for the axis: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  // Counts are whole numbers: an axis reading 0 / 0.5 / 1 for "visits"
  // invites the question of what half a visit is.
  return Math.max(1, nice * exp);
}

/* ---- trend ------------------------------------------------------------ */

/**
 * @param {HTMLElement} host
 * @param {{
 *   points: Array<{t:string, cur:number|null, prev:number|null, prevT?:string}>,
 *   format: (v:number, axis?:boolean) => string,
 *   xLabel: (t:string) => string,
 *   title: (p:object) => string,
 *   prevTitle: (p:object) => string,
 *   curName: string, prevName: string, showPrev: boolean, label: string,
 * }} opts
 */
export function trendChart(host, opts) {
  host._trend = opts;
  drawTrend(host);

  // Redrawn at the width it actually has, rather than scaled: a scaled SVG
  // stretches its text along with its lines.
  if (!host._trendObserver && 'ResizeObserver' in window) {
    let last = host.clientWidth;
    host._trendObserver = new ResizeObserver(() => {
      if (Math.abs(host.clientWidth - last) > 16) {
        last = host.clientWidth;
        drawTrend(host);
      }
    });
    host._trendObserver.observe(host);
  }
}

function drawTrend(host) {
  const o = host._trend;
  const points = o.points || [];
  const n = points.length;

  if (!n) {
    host.innerHTML = '<p class="tempty">Nothing to draw yet.</p>';
    return;
  }

  const width = Math.max(300, Math.round(host.clientWidth || 640));
  const height = 248;
  const pad = { t: 16, r: 16, b: 32, l: 52 };
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;

  const values = points.flatMap((p) => [p.cur, o.showPrev ? p.prev : null]).filter((v) => v != null);
  const max = niceMax(Math.max(0, ...values));
  const x = (i) => pad.l + (n <= 1 ? W / 2 : (i * W) / (n - 1));
  const y = (v) => pad.t + H - (v / max) * H;

  const grid = [0, max / 2, max].map((t) => `
    <line class="tchart__grid${t === 0 ? ' tchart__grid--base' : ''}" x1="${pad.l}" x2="${pad.l + W}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>
    <text class="tchart__ytick" x="${pad.l - 10}" y="${y(t).toFixed(1)}" dy="0.32em" text-anchor="end">${escapeHtml(o.format(t, true))}</text>`).join('');

  // At most about seven x labels, whatever the width; the tooltip names the rest.
  const step = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 90))));
  const xt = points.map((p, i) => {
    const onStep = i % step === 0;
    const isLast = i === n - 1 && (n - 1) % step >= step / 2;
    if (!onStep && !isLast) return '';
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    return `<text class="tchart__xtick" x="${x(i).toFixed(1)}" y="${height - 10}" text-anchor="${anchor}">${escapeHtml(o.xLabel(p.t))}</text>`;
  }).join('');

  const line = (key) => {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const drawn = points.map((p, i) => (p.cur != null ? i : -1)).filter((i) => i >= 0);
  const area = drawn.length > 1
    ? `M${x(drawn[0]).toFixed(1)},${y(0).toFixed(1)}${drawn.map((i) => `L${x(i).toFixed(1)},${y(points[i].cur).toFixed(1)}`).join('')}L${x(drawn[drawn.length - 1]).toFixed(1)},${y(0).toFixed(1)}Z`
    : '';

  // A lone point has no line to sit on, so it is drawn as a dot.
  const lone = drawn.length === 1
    ? `<circle class="tchart__end" cx="${x(drawn[0]).toFixed(1)}" cy="${y(points[drawn[0]].cur).toFixed(1)}" r="4"/>`
    : '';
  const end = drawn.length > 1
    ? `<circle class="tchart__end" cx="${x(drawn[drawn.length - 1]).toFixed(1)}" cy="${y(points[drawn[drawn.length - 1]].cur).toFixed(1)}" r="4"/>`
    : '';

  host.innerHTML = `
    <svg class="tchart__svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"
         role="img" tabindex="0" aria-label="${escapeHtml(o.label)} Use the arrow keys to step through the points.">
      ${grid}
      ${xt}
      ${area ? `<path class="tchart__area" d="${area}"/>` : ''}
      ${o.showPrev ? `<path class="tchart__line tchart__line--prev" d="${line('prev')}"/>` : ''}
      <path class="tchart__line tchart__line--cur" d="${line('cur')}"/>
      ${lone}${end}
      <line class="tchart__cross" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + H}"/>
      <circle class="tchart__dot tchart__dot--prev" r="4" cx="-10" cy="-10"/>
      <circle class="tchart__dot tchart__dot--cur" r="4.5" cx="-10" cy="-10"/>
      <rect class="tchart__hit" x="${pad.l - 8}" y="0" width="${W + 16}" height="${height}"/>
    </svg>`;

  const svg = host.querySelector('svg');
  const cross = svg.querySelector('.tchart__cross');
  const dotCur = svg.querySelector('.tchart__dot--cur');
  const dotPrev = svg.querySelector('.tchart__dot--prev');
  let at = drawn.length ? drawn[drawn.length - 1] : 0;

  const place = (i, cx, cy) => {
    at = i;
    const p = points[i];
    cross.setAttribute('x1', x(i));
    cross.setAttribute('x2', x(i));
    dotCur.setAttribute('cx', p.cur == null ? -10 : x(i));
    dotCur.setAttribute('cy', p.cur == null ? -10 : y(p.cur));
    const showPrev = o.showPrev && p.prev != null;
    dotPrev.setAttribute('cx', showPrev ? x(i) : -10);
    dotPrev.setAttribute('cy', showPrev ? y(p.prev) : -10);
    svg.classList.add('is-hover');

    showTip(cx, cy, (el) => {
      tipTitle(el, o.title(p));
      tipRow(el, { value: p.cur == null ? 'not yet' : o.format(p.cur), label: o.curName, key: 'cur' });
      if (showPrev) tipRow(el, { value: o.format(p.prev), label: `${o.prevName} · ${o.prevTitle(p)}`, key: 'prev' });
    });
  };

  const fromPointer = (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    const i = n <= 1 ? 0 : Math.round(((px - pad.l) / W) * (n - 1));
    place(Math.max(0, Math.min(n - 1, i)), e.clientX, e.clientY);
  };

  const hide = () => { svg.classList.remove('is-hover'); hideTip(); };

  svg.addEventListener('pointermove', fromPointer);
  svg.addEventListener('pointerdown', fromPointer);
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
        : Math.max(0, Math.min(n - 1, at + (e.key === 'ArrowRight' ? 1 : -1)));
    const r = svg.getBoundingClientRect();
    const p = points[next];
    const vy = p.cur ?? p.prev ?? 0;
    place(next, r.left + (x(next) / width) * r.width, r.top + (y(vy) / height) * r.height);
  });
}

/* ---- sparkline -------------------------------------------------------- */

/** The shape of a series inside a tile. Nulls (hours still to come) break the line. */
export function sparkline(values, { width = 96, height = 30 } = {}) {
  const drawn = values.filter((v) => v != null);
  if (drawn.length < 2) return '';

  const max = Math.max(...drawn, 1);
  const pts = values.map((v, i) => (v == null ? null : [
    2 + (i / (values.length - 1)) * (width - 4),
    height - 3 - (v / max) * (height - 6),
  ]));

  let d = '';
  let pen = false;
  pts.forEach((p) => {
    if (!p) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    pen = true;
  });

  const last = [...pts].reverse().find(Boolean);

  return `<svg class="tspark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">
    <path d="${d}"/>${last ? `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5"/>` : ''}</svg>`;
}

/* ---- columns (the last thirty minutes) -------------------------------- */

export function columns(host, { points, value, title, format }) {
  const max = niceMax(Math.max(1, ...points.map(value)));

  host.innerHTML = `<div class="tcols">${points.map((p, i) => {
    const v = value(p);
    const h = v > 0 ? Math.max(6, (v / max) * 100) : 0;
    return `<div class="tcols__col" data-i="${i}"><div class="tcols__bar${v > 0 ? '' : ' tcols__bar--zero'}" style="height:${h.toFixed(1)}%"></div></div>`;
  }).join('')}</div>`;

  const wrap = host.firstElementChild;
  wrap.addEventListener('pointermove', (e) => {
    const col = e.target.closest('.tcols__col');
    if (!col) return;
    const p = points[+col.dataset.i];
    showTip(e.clientX, e.clientY, (el) => {
      tipTitle(el, title(p));
      tipRow(el, { value: format(value(p)), key: 'cur' });
    });
  });
  wrap.addEventListener('pointerleave', hideTip);
}

/* ---- heatmap ---------------------------------------------------------- */

/** Saturday first: the Bangladeshi working week. WEEKDAY() numbers Monday as 0. */
const DAY_ORDER = [5, 6, 0, 1, 2, 3, 4];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Visits by weekday and hour, one hue, five steps plus empty.
 *
 * Roving focus: the grid is ONE tab stop, and the arrow keys walk its 168
 * cells — each announces its day, hour and counts. A tab stop per cell would
 * make the rest of the screen 168 presses away.
 */
export function heatmap(host, { cells, max, hourLabel, format }) {
  const at = new Map(cells.map((c) => [`${c.d}-${c.h}`, c]));
  const top = Math.max(1, max || 0);
  const level = (v) => (v <= 0 ? 0 : Math.min(5, Math.ceil((v / top) * 5)));

  let html = '<div class="theat" role="group" aria-label="Visits by day of the week and hour of the day">';
  html += '<span class="theat__corner" aria-hidden="true"></span>';
  for (let h = 0; h < 24; h++) {
    html += `<span class="theat__hour" aria-hidden="true">${h % 3 === 0 ? escapeHtml(hourLabel(h)) : ''}</span>`;
  }

  DAY_ORDER.forEach((d, row) => {
    html += `<span class="theat__day" aria-hidden="true">${DAY_NAMES[d]}</span>`;
    for (let h = 0; h < 24; h++) {
      const c = at.get(`${d}-${h}`) || { sessions: 0, orders: 0 };
      const label = `${DAY_NAMES[d]} ${hourLabel(h)}: ${format(c.sessions)} visit${c.sessions === 1 ? '' : 's'}${c.orders ? `, ${c.orders} order${c.orders === 1 ? '' : 's'}` : ''}`;
      html += `<span class="theat__cell theat__cell--l${level(c.sessions)}" role="img" tabindex="${row === 0 && h === 0 ? 0 : -1}"
        data-r="${row}" data-h="${h}" aria-label="${escapeHtml(label)}">${c.orders ? '<span class="theat__dot"></span>' : ''}</span>`;
    }
  });
  html += '</div>';

  host.innerHTML = html;
  const grid = host.firstElementChild;

  const tipFor = (cell, cx, cy) => {
    const d = DAY_ORDER[+cell.dataset.r];
    const h = +cell.dataset.h;
    const c = at.get(`${d}-${h}`) || { sessions: 0, orders: 0 };
    showTip(cx, cy, (el) => {
      tipTitle(el, `${DAY_NAMES[d]} · ${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`);
      tipRow(el, { value: format(c.sessions), label: c.sessions === 1 ? 'visit' : 'visits', key: 'cur' });
      if (c.orders) tipRow(el, { value: format(c.orders), label: c.orders === 1 ? 'order' : 'orders' });
    });
  };

  grid.addEventListener('pointermove', (e) => {
    const cell = e.target.closest('.theat__cell');
    if (cell) tipFor(cell, e.clientX, e.clientY); else hideTip();
  });
  grid.addEventListener('pointerleave', hideTip);
  grid.addEventListener('focusin', (e) => {
    const cell = e.target.closest('.theat__cell');
    if (!cell) return;
    const r = cell.getBoundingClientRect();
    tipFor(cell, r.right, r.bottom);
  });
  grid.addEventListener('focusout', hideTip);
  grid.addEventListener('keydown', (e) => {
    const cell = e.target.closest('.theat__cell');
    if (!cell) return;
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const r = Math.max(0, Math.min(6, +cell.dataset.r + m[0]));
    const h = Math.max(0, Math.min(23, +cell.dataset.h + m[1]));
    const next = grid.querySelector(`.theat__cell[data-r="${r}"][data-h="${h}"]`);
    if (!next) return;
    cell.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
  });
}

/* ---- ranked bars ------------------------------------------------------ */

/**
 * A ranked list as bars. `label` and `meta` return HTML the caller has
 * already escaped; the value is formatted here.
 */
export function barList(rows, { label, value, format, meta, max } = {}) {
  if (!rows.length) return '<p class="tempty">Nothing in this period yet.</p>';

  const top = max ?? Math.max(1, ...rows.map(value));

  return `<ul class="tbars">${rows.map((r) => {
    const v = value(r) || 0;
    const w = v > 0 ? Math.max(1.5, (v / top) * 100) : 0;
    return `<li class="tbars__row">
      <span class="tbars__label">${label(r)}</span>
      <span class="tbars__track" aria-hidden="true"><span class="tbars__bar" style="width:${w.toFixed(1)}%"></span></span>
      <span class="tbars__value">${escapeHtml(format(v))}${meta ? `<span class="tbars__meta">${meta(r)}</span>` : ''}</span>
    </li>`;
  }).join('')}</ul>`;
}

/* ---- order outcomes --------------------------------------------------- */

/**
 * Status, not identity: these colours MEAN something — delivered is good,
 * cancelled is bad — so they come from the status scale and never double as
 * series colours anywhere else on the screen. Each segment also carries its
 * word, in the legend and on hover, so the bar reads in greyscale too.
 */
export const OUTCOME_KEYS = ['delivered', 'in_progress', 'returned', 'cancelled', 'spam'];
export const OUTCOME_LABELS = {
  delivered: 'Delivered',
  in_progress: 'In progress',
  returned: 'Returned',
  cancelled: 'Cancelled',
  spam: 'Fake / spam',
};

export function statusBar(counts) {
  const parts = OUTCOME_KEYS.filter((k) => (counts[k] || 0) > 0);
  if (!parts.length) return '<span class="tstatus tstatus--empty" aria-hidden="true"></span>';

  const said = parts.map((k) => `${OUTCOME_LABELS[k]} ${counts[k]}`).join(', ');

  return `<span class="tstatus" role="img" aria-label="${escapeHtml(said)}">${parts.map((k) =>
    `<span class="tstatus__seg tstatus__seg--${k}" style="flex-grow:${counts[k]}" title="${escapeHtml(`${OUTCOME_LABELS[k]}: ${counts[k]}`)}"></span>`,
  ).join('')}</span>`;
}

export function statusLegend() {
  return `<ul class="tlegend tlegend--status">${OUTCOME_KEYS.map((k) =>
    `<li><span class="tlegend__swatch tstatus__seg--${k}" aria-hidden="true"></span>${escapeHtml(OUTCOME_LABELS[k])}</li>`,
  ).join('')}</ul>`;
}
