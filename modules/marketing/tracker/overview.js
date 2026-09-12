/**
 * tracker/overview.js — the first tab: what stands out, the headline numbers
 * against the period before, the trend, the funnel, and where visits came from.
 */

import {
  escapeHtml, num, taka, pct, rate, delta, deltaChip, stepLabel, channelTag,
  bucketLabel, shortPath,
} from './format.js';
import { trendChart, sparkline, barList } from './charts.js';

/* ---- insights --------------------------------------------------------- */

const TONES = {
  bad: {
    word: 'Needs attention',
    icon: '<path d="M12 3.5 2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4.5M12 17.2h.01"/>',
  },
  warn: {
    word: 'Worth a look',
    icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5M12 15.8h.01"/>',
  },
  good: {
    word: 'Going well',
    icon: '<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.3 2.5 2.5 4.9-5.2"/>',
  },
  info: {
    word: 'Good to know',
    icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.8h.01"/>',
  },
};

const TAB_WORDS = {
  live: 'Open Live',
  sources: 'See sources',
  audience: 'See audience',
  products: 'See products',
  search: 'See searches',
  checkout: 'See checkout',
  visits: 'See visits',
};

export function paintInsights(host, list) {
  if (!list.length) {
    host.innerHTML = `<p class="tempty tempty--calm">Nothing out of the ordinary in this period.
      Findings appear here once there is enough traffic to say something true — a few dozen visits for most of them.</p>`;
    return;
  }

  host.innerHTML = list.map((i) => {
    const tone = TONES[i.tone] ?? TONES.info;
    const go = i.tab && TAB_WORDS[i.tab]
      ? `<button type="button" class="tlink" data-goto-tab="${escapeHtml(i.tab)}">${TAB_WORDS[i.tab]} <span aria-hidden="true">→</span></button>`
      : '';
    return `
      <article class="tinsight tinsight--${escapeHtml(i.tone)}">
        <div class="tinsight__top">
          <span class="tinsight__tone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tone.icon}</svg>${tone.word}</span>
          ${i.figure ? `<span class="tinsight__figure">${escapeHtml(i.figure)}</span>` : ''}
        </div>
        <h3 class="tinsight__title">${escapeHtml(i.title)}</h3>
        <p class="tinsight__body">${escapeHtml(i.body)}</p>
        ${go}
      </article>`;
  }).join('');
}

/* ---- headline tiles --------------------------------------------------- */

const TILES = [
  { key: 'visitors', label: 'Visitors', fmt: num, spark: 'visitors', sub: (k) => `${num(k.newVisitors?.value)} new` },
  { key: 'sessions', label: 'Visits', fmt: num, spark: 'sessions' },
  { key: 'orders', label: 'Orders tracked', fmt: num, spark: 'orders' },
  { key: 'revenueTaka', label: 'Revenue tracked', fmt: taka, spark: 'revenueTaka' },
  { key: 'conversionPct', label: 'Visits that ordered', fmt: pct, points: true },
  { key: 'aovTaka', label: 'Average order', fmt: taka },
  { key: 'bouncePct', label: 'Left after one page', fmt: pct, points: true, goodWhenUp: false },
  {
    key: 'abandonedTaka', label: 'Left at checkout', fmt: taka, goodWhenUp: false,
    sub: (k) => `${num(k.abandoned?.value)} visit${k.abandoned?.value === 1 ? '' : 's'}`,
  },
];

function paintKpis(host, data) {
  const k = data.kpis;
  const pts = data.series?.points ?? [];
  const compare = data.filter?.compareLabel;

  host.innerHTML = TILES.map((t) => {
    const pair = k[t.key] ?? {};
    const d = delta(pair.value, pair.prev, { goodWhenUp: t.goodWhenUp !== false, points: t.points });
    const spark = t.spark ? sparkline(pts.map((p) => p[t.spark])) : '';
    const prevText = pair.prev == null ? '' : `was ${t.fmt(pair.prev)}`;

    return `
      <div class="tkpi">
        <span class="tkpi__label">${escapeHtml(t.label)}</span>
        <span class="tkpi__value">${escapeHtml(t.fmt(pair.value))}</span>
        <span class="tkpi__foot">
          ${pair.value == null && pair.prev == null ? '' : deltaChip(d, compare)}
          <span class="tkpi__sub">${escapeHtml(t.sub ? t.sub(k) : prevText)}</span>
        </span>
        ${spark ? `<span class="tkpi__spark">${spark}</span>` : ''}
      </div>`;
  }).join('');
}

/* ---- trend ------------------------------------------------------------ */

const METRICS = {
  sessions: { name: 'visits', fmt: num },
  visitors: { name: 'visitors', fmt: num },
  orders: { name: 'orders', fmt: num },
  revenueTaka: { name: 'revenue', fmt: taka },
};

/** Axis ticks in taka lose the symbol and group, to stay narrow. */
function axisTaka(v) {
  return v >= 1000 ? `${num(Math.round(v / 1000))}k` : num(v);
}

export function paintTrend(root, data, metric) {
  const host = root.querySelector('[data-t-trend]');
  const legend = root.querySelector('[data-t-trend-legend]');
  const sub = root.querySelector('[data-t-trend-sub]');
  const series = data.series ?? { points: [], bucket: 'day' };
  const f = data.filter ?? {};
  const m = METRICS[metric] ?? METRICS.sessions;
  const bucket = series.bucket;

  const points = series.points.map((p) => ({
    t: p.t,
    cur: p[metric],
    prev: p.prev ? p.prev[metric] : null,
    prevT: p.prev?.t,
  }));

  const total = points.reduce((s, p) => s + (p.cur ?? 0), 0);
  const prevTotal = points.reduce((s, p) => s + (p.prev ?? 0), 0);

  if (sub) {
    sub.textContent = `${m.fmt(total)} ${metric === 'revenueTaka' ? 'in revenue' : m.name} ${bucket === 'hour' ? 'by hour' : 'by day'}, `
      + `against ${m.fmt(prevTotal)} in ${f.compareLabel ?? 'the previous period'}.`;
  }

  if (legend) {
    legend.innerHTML = `
      <li><span class="tlegend__line tlegend__line--cur" aria-hidden="true"></span>${escapeHtml(f.label ?? 'This period')}</li>
      <li><span class="tlegend__line tlegend__line--prev" aria-hidden="true"></span>${escapeHtml(capitalise(f.compareLabel ?? 'Previous period'))}</li>`;
  }

  trendChart(host, {
    points,
    showPrev: true,
    format: (v, axis) => (metric === 'revenueTaka' ? (axis ? axisTaka(v) : taka(v)) : num(Math.round(v))),
    xLabel: (t) => bucketLabel(t, bucket),
    title: (p) => bucketLabel(p.t, bucket, true) + (bucket === 'hour' ? ` · ${bucketLabel(p.t, 'day', true)}` : ''),
    prevTitle: (p) => (p.prevT ? bucketLabel(p.prevT, bucket === 'hour' ? 'day' : bucket, true) : ''),
    curName: f.label ?? 'This period',
    prevName: capitalise(f.compareLabel ?? 'previous period'),
    label: `${capitalise(m.name)} ${bucket === 'hour' ? 'by hour' : 'by day'}: ${m.fmt(total)} in this period against ${m.fmt(prevTotal)} before.`,
  });

  // The table twin of the chart, for anyone who wants the numbers rather
  // than the shape — or cannot see the shape.
  const wrap = root.querySelector('[data-t-trend-tablewrap]');
  if (wrap) {
    wrap.innerHTML = `
      <div class="atable-wrap"><table class="atable atable--tight">
        <thead><tr>
          <th scope="col">${bucket === 'hour' ? 'Hour' : 'Day'}</th>
          <th scope="col" class="atable__num">${escapeHtml(f.label ?? 'This period')}</th>
          <th scope="col" class="atable__num">${escapeHtml(capitalise(f.compareLabel ?? 'Before'))}</th>
        </tr></thead>
        <tbody>${points.map((p) => `
          <tr>
            <td>${escapeHtml(bucketLabel(p.t, bucket, true))}</td>
            <td class="atable__num">${p.cur == null ? '—' : escapeHtml(m.fmt(p.cur))}</td>
            <td class="atable__num">${p.prev == null ? '—' : escapeHtml(m.fmt(p.prev))}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  }
}

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ---- funnel ----------------------------------------------------------- */

function paintFunnel(host, rows, compareLabel) {
  if (!rows?.length || rows[0].sessions === 0) {
    host.innerHTML = '<p class="tempty">No visits recorded in this period yet.</p>';
    return;
  }

  host.innerHTML = rows.map((r) => {
    // Width is share OF THE TOP, so every bar is measured against the same
    // reference and the narrowing reads at a glance.
    const width = r.ofTopPct ?? 0;

    // Colour only a loss worth acting on; colouring every one teaches the eye
    // to skip the colour, and then it misses the one that mattered.
    const bad = r.dropOffPct !== null && r.dropOffPct >= 60;

    let note;
    if (r.dropOffPct === null) {
      note = '<span class="fnl__pct">the top of the funnel</span>';
    } else if (r.dropOffPct < 0) {
      // Express checkout goes from a product straight to checkout, so a step
      // can see more visits than the one above it.
      note = '<span class="fnl__pct">some visits skip the step above</span>';
    } else {
      note = `<span class="fnl__pct fnl__drop${bad ? ' fnl__drop--bad' : ''}">−${r.dropOffPct}% from the step above</span>`;
    }

    const was = `<span class="fnl__pct">was ${num(r.prevSessions)} in ${escapeHtml(compareLabel ?? 'the period before')}</span>`;

    return `
      <div class="fnl__row">
        <span class="fnl__stage">${escapeHtml(stepLabel(r.stage))}</span>
        <div class="fnl__track" aria-hidden="true"><div class="fnl__bar" style="width:${Math.max(width, r.sessions ? 1 : 0)}%"></div></div>
        <span class="fnl__count"><b>${num(r.sessions)}</b> <span class="fnl__pct">${pct(r.ofTopPct ?? 0)} of visits</span>${note}${was}</span>
      </div>`;
  }).join('');
}

/* ---- the rest --------------------------------------------------------- */

function paintMix(host, rows) {
  host.innerHTML = barList(rows, {
    label: (r) => channelTag(r.channel),
    value: (r) => r.sessions,
    format: num,
    meta: (r) => `${escapeHtml(pct(rate(r.converted, r.sessions)))} ordered`,
  });
}

function paintPages(host, rows) {
  host.innerHTML = rows?.length
    ? rows.map((p) => `
        <tr>
          <td><span class="tpath" title="${escapeHtml(p.path)}">${escapeHtml(shortPath(p.path, 60))}</span></td>
          <td class="atable__num">${num(p.sessions)}</td>
          <td class="atable__num">${num(p.views)}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" class="atable__empty">Nothing yet.</td></tr>';
}

export function paintOverview(root, data, metric) {
  paintKpis(root.querySelector('[data-t-kpis]'), data);
  paintTrend(root, data, metric);
  paintFunnel(root.querySelector('[data-t-funnel]'), data.funnel, data.filter?.compareLabel);
  paintMix(root.querySelector('[data-t-mix]'), data.channels ?? []);
  paintPages(root.querySelector('[data-t-pages]'), data.topPages);
}
