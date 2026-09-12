/**
 * tracker/format.js — words and numbers for the Tracking screen.
 *
 * Every label beside a key (channel, device, browser) comes from the server,
 * which ships its own dictionary with each report (AnalyticsService::labels).
 * This file only holds that dictionary once it arrives and falls back to the
 * raw key when a word is missing — a new channel added on the server shows up
 * as its key rather than as a blank.
 *
 * Nothing here computes a rate that the server already computed. Formatting
 * only: the day the screen and the export disagree about a percentage must
 * never be caused by a second definition living in the browser.
 */

import { escapeHtml } from '../../admin/admin-shell.js';

export { escapeHtml };

/** The server's words for its keys, filled by setLabels() on the first response. */
export const L = { channels: {}, devices: {}, os: {}, browsers: {}, inApp: [], periods: {} };

export function setLabels(labels) {
  if (labels && typeof labels === 'object') Object.assign(L, labels);
}

export const channelLabel = (k) => (k ? L.channels[k] ?? k : 'Unknown');
export const deviceLabel = (k) => (k ? L.devices[k] ?? k : 'Unknown');
export const osLabel = (k) => (k ? L.os[k] ?? k : 'Unknown');
export const browserLabel = (k) => (k ? L.browsers[k] ?? k : 'Unknown');
export const isInApp = (k) => Array.isArray(L.inApp) && L.inApp.includes(k);

/** Meta's event names are not the words a shopkeeper uses. */
const EVENTS = {
  PageView: 'Visited a page',
  ViewContent: 'Opened a product',
  AddToCart: 'Added to cart',
  InitiateCheckout: 'Started checkout',
  Purchase: 'Ordered',
  AddToWishlist: 'Saved to wishlist',
  Search: 'Searched',
  CompleteRegistration: 'Created an account',
  Contact: 'Sent a message',
};

/** The same, as the step of a funnel. */
const STEPS = {
  PageView: 'Visited the shop',
  ViewContent: 'Opened a product',
  AddToCart: 'Added to cart',
  InitiateCheckout: 'Started checkout',
  Purchase: 'Ordered',
};

export const eventLabel = (name) => EVENTS[name] ?? name;
export const stepLabel = (name) => STEPS[name] ?? eventLabel(name);

/** How far a visit got, in the words the visit list and live view use. */
export const STAGES = {
  ordered: { label: 'Ordered', tone: 'ok' },
  checkout: { label: 'At checkout', tone: 'warn' },
  cart: { label: 'Has a cart', tone: 'info' },
  product: { label: 'Looking at products', tone: '' },
  browsing: { label: 'Browsing', tone: '' },
};

export function stageChip(stage) {
  const s = STAGES[stage] ?? STAGES.browsing;
  return `<span class="tchip${s.tone ? ` tchip--${s.tone}` : ''}">${escapeHtml(s.label)}</span>`;
}

/* ---- numbers ---------------------------------------------------------- */

const NF = new Intl.NumberFormat('en-BD');

export function num(n) {
  return n == null || Number.isNaN(+n) ? '—' : NF.format(n);
}

export function taka(n) {
  return n == null || Number.isNaN(+n) ? '—' : `৳ ${NF.format(Math.round(n))}`;
}

/** Whole numbers from 10 up, one decimal below it — where the decimal carries meaning. */
export function pct(n) {
  if (n == null || Number.isNaN(+n)) return '—';
  const v = +n;
  const s = Math.abs(v) >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
  return `${s}%`;
}

/** A rate from two counts, or null when there is nothing to divide by. */
export function rate(part, whole) {
  return whole > 0 ? (part / whole) * 100 : null;
}

/**
 * The change between two periods, for a delta chip.
 *
 * `goodWhenUp` is false for the numbers where more is worse — bounce, money
 * left at checkout. Null when there is no honest comparison: from nothing,
 * any value is an infinite increase, and "+∞%" teaches nobody anything.
 */
export function delta(now, before, { goodWhenUp = true, points = false } = {}) {
  if (now == null || before == null) return null;
  if (points) {
    const diff = now - before;
    if (Math.abs(diff) < 0.05) return { text: 'no change', tone: 'flat', dir: 'flat' };
    const up = diff > 0;
    return {
      text: `${up ? '+' : '−'}${pct(Math.abs(diff)).replace('%', '')} pts`,
      tone: up === goodWhenUp ? 'good' : 'bad',
      dir: up ? 'up' : 'down',
    };
  }
  if (before === 0) return now === 0 ? { text: 'no change', tone: 'flat', dir: 'flat' } : null;
  const change = ((now - before) / before) * 100;
  if (Math.abs(change) < 0.5) return { text: 'no change', tone: 'flat', dir: 'flat' };
  const up = change > 0;
  return {
    text: `${up ? '+' : '−'}${pct(Math.abs(change))}`,
    tone: up === goodWhenUp ? 'good' : 'bad',
    dir: up ? 'up' : 'down',
  };
}

export function deltaChip(d, compareLabel) {
  if (!d) return '<span class="tdelta tdelta--flat">new</span>';
  const arrow = d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '•';
  const title = compareLabel ? ` title="Compared with ${escapeHtml(compareLabel)}"` : '';
  return `<span class="tdelta tdelta--${d.tone}"${title}><span aria-hidden="true">${arrow}</span> ${escapeHtml(d.text)}</span>`;
}

/* ---- time ------------------------------------------------------------- */

export function duration(sec) {
  if (sec == null) return '—';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function ago(sec) {
  if (sec == null) return '—';
  const s = Math.max(0, Math.round(sec));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

function parse(ts) {
  if (!ts) return null;
  const d = new Date(String(ts).replace(' ', 'T'));
  return Number.isNaN(+d) ? null : d;
}

export function when(ts) {
  const d = parse(ts);
  return d ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

export function clock(ts) {
  const d = parse(ts);
  return d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}

export function dayLabel(ts, withWeekday = false) {
  const d = parse(String(ts).length === 10 ? `${ts} 00:00:00` : ts);
  if (!d) return String(ts ?? '');
  return d.toLocaleDateString('en-GB', withWeekday
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short' });
}

export function hourLabel(h) {
  if (h === 0) return '12 am';
  if (h === 12) return '12 pm';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

/** The label for one point on the chart's x-axis. */
export function bucketLabel(key, bucket, withWeekday = false) {
  if (bucket === 'hour') {
    const d = parse(key);
    return d ? hourLabel(d.getHours()) : key;
  }
  return dayLabel(key, withWeekday);
}

/* ---- pieces ----------------------------------------------------------- */

/** An inline icon for a device, so a list of visits can be scanned by shape. */
export function deviceIcon(device) {
  const paths = {
    mobile: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
    tablet: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M11 18h2"/>',
    desktop: '<rect x="2.5" y="4" width="19" height="12.5" rx="1.5"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  };
  const d = paths[device] ?? '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16h.01"/>';
  return `<svg class="ticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">${d}</svg>`;
}

/** "Phone · Facebook app" — with the in-app badge where it matters. */
export function deviceLine(device, browser) {
  const app = browser ? browserLabel(browser) : null;
  return `<span class="tdev">${deviceIcon(device)}<span>${escapeHtml(deviceLabel(device))}${
    app ? ` · ${escapeHtml(app)}` : ''}</span>${isInApp(browser) ? '<span class="tbadge">in-app</span>' : ''}</span>`;
}

/** Channels somebody paid for — the one distinction worth a mark beside the name. */
const PAID = ['meta_ads', 'google_ads'];

/**
 * The channel as a word, with an "ad" badge when the click was paid for.
 *
 * No colour per channel: there are sixteen of them, twice what any reader
 * can tell apart by hue, and a colour that means "Messenger" on one screen
 * and nothing on the next is worse than none.
 */
export function channelTag(channel) {
  return `<span class="tchan">${escapeHtml(channelLabel(channel))}${
    PAID.includes(channel) ? '<span class="tbadge tbadge--ad">ad</span>' : ''}</span>`;
}

/** A path, shortened for a table cell without losing its end. */
export function shortPath(path, max = 42) {
  if (!path) return '—';
  const p = String(path);
  return p.length > max ? `…${p.slice(-(max - 1))}` : p;
}
