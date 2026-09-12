/**
 * tracker/live.js — who is on the shop right now.
 *
 * The tab a merchant leaves open while an ad is running. It answers the
 * question every other panel answers too late: is the money going in working,
 * this minute?
 *
 * "Now" is the last five minutes. The storefront sends no heartbeat, so a
 * visitor reading one page for ten minutes has, as far as the server knows,
 * gone. That is stated on the panel rather than hidden, because a number
 * labelled "live" that quietly means something else is worse than a smaller
 * honest one.
 */

import {
  escapeHtml, num, taka, when, ago, duration, eventLabel,
  channelTag, channelLabel, deviceLine, deviceLabel, browserLabel, stageChip, shortPath,
} from './format.js';
import { columns } from './charts.js';

/** The icon beside each event in the feed — shape first, words beside it. */
const EVENT_ICONS = {
  PageView: '<path d="M4 5.5h16v13H4z"/><path d="M4 9.5h16"/>',
  ViewContent: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
  AddToCart: '<circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/><path d="M2.8 4h2.4l2.4 10.5h10.2l2-7.5H6.4"/>',
  InitiateCheckout: '<path d="M4.5 7.5h15l-1.2 11H5.7z"/><path d="M8.8 7.5V6a3.2 3.2 0 0 1 6.4 0v1.5"/>',
  Purchase: '<circle cx="12" cy="12" r="8.6"/><path d="m8.3 12.3 2.5 2.5 4.9-5.2"/>',
  AddToWishlist: '<path d="M12 20s-7.2-4.4-7.2-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7.2 2.7C19.2 15.6 12 20 12 20z"/>',
  Search: '<circle cx="10.8" cy="10.8" r="6"/><path d="m15.4 15.4 4.3 4.3"/>',
  CompleteRegistration: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
  Contact: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
};

function icon(name) {
  return `<svg class="tfeed__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EVENT_ICONS[name] ?? EVENT_ICONS.PageView}</svg>`;
}

export function paintLive(host, d) {
  const active = d.active ?? 0;

  host.innerHTML = `
    <section class="tcard tcard--live" aria-labelledby="t-live-h">
      <div class="tcard__head">
        <div>
          <h2 class="tcard__title" id="t-live-h">On the shop now</h2>
          <p class="tcard__sub">Visitors who did something in the last ${d.activeMinutes ?? 5} minutes. The shop sends nothing while a page simply sits open, so somebody reading quietly drops off this list.</p>
        </div>
        <p class="tstamp" data-t-live-stamp>Updated ${escapeHtml(when(d.now))}</p>
      </div>

      <div class="tlive__top">
        <p class="thero"><span class="thero__n">${num(active)}</span> <span class="thero__l">${active === 1 ? 'visitor' : 'visitors'} right now</span></p>
        <ul class="tlive__chips">
          <li class="tchip tchip--warn">${num(d.inCheckout)} at checkout</li>
          <li class="tchip tchip--info">${num(d.withCart)} with a cart</li>
          <li class="tchip tchip--ok">${num(d.ordered)} ordered</li>
        </ul>
      </div>

      <p class="tcard__sub">Today so far: <b>${num(d.today?.sessions)}</b> visits · <b>${num(d.today?.orders)}</b> orders · <b>${escapeHtml(taka(d.today?.revenueTaka))}</b> tracked.</p>

      <h3 class="tsub">Visits per minute, last 30 minutes</h3>
      <div class="tminutes" data-t-minutes></div>
      <p class="tnote"><span data-t-minutes-from>—</span> to <span data-t-minutes-to>now</span></p>
    </section>

    <div class="tgrid tgrid--2">
      <section class="tcard" aria-labelledby="t-live-visitors-h">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-live-visitors-h">Who is here</h2>
          <p class="tcard__sub">Open one to follow every step it has taken.</p>
        </div></div>
        ${visitors(d.visitors ?? [])}
      </section>

      <section class="tcard" aria-labelledby="t-live-feed-h">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-live-feed-h">As it happens</h2>
          <p class="tcard__sub">Every event of the last hour, newest first.</p>
        </div></div>
        ${feed(d.feed ?? [])}
      </section>
    </div>`;

  const minutes = host.querySelector('[data-t-minutes]');
  const points = d.perMinute ?? [];
  if (minutes && points.length) {
    columns(minutes, {
      points,
      value: (p) => p.sessions,
      format: (v) => `${num(v)} visit${v === 1 ? '' : 's'}`,
      title: (p) => p.t,
    });
    host.querySelector('[data-t-minutes-from]').textContent = points[0].t;
    host.querySelector('[data-t-minutes-to]').textContent = points[points.length - 1].t;
  }
}

function visitors(rows) {
  if (!rows.length) {
    return `<p class="tempty">Nobody is on the shop this minute. Open the storefront on your phone and this list fills within seconds — which is also how you check that tracking is working.</p>`;
  }

  return `<ul class="tvisitors">${rows.map((v) => `
    <li class="tvisitor">
      <div class="tvisitor__main">
        <p class="tvisitor__now">${escapeHtml(v.current_title || shortPath(v.current_path, 34) || 'the shop')}</p>
        <p class="tvisitor__meta">${channelTag(v.channel)} · ${deviceLine(v.device, v.browser)}${
          v.visit_type === 'returning' ? ' · <span class="tbadge">returning</span>' : ''}</p>
        <p class="tvisitor__meta">${escapeHtml(eventLabel(v.last_event))} · ${escapeHtml(ago(v.idleSeconds))} · ${num(v.pages)} page${v.pages === 1 ? '' : 's'} · ${escapeHtml(duration(v.seconds))} on the shop</p>
      </div>
      <div class="tvisitor__side">
        ${stageChip(v.stage)}
        ${v.cartTaka ? `<span class="tvisitor__value">${escapeHtml(taka(v.cartTaka))}</span>` : ''}
        <button type="button" class="tlink" data-session="${escapeHtml(v.session_id)}">Follow <span aria-hidden="true">→</span></button>
      </div>
    </li>`).join('')}</ul>`;
}

function feed(rows) {
  if (!rows.length) {
    return '<p class="tempty">No events in the last hour.</p>';
  }

  return `<ul class="tfeed">${rows.map((e) => {
    const what = e.event_name === 'Search'
      ? `“${escapeHtml(e.search_term ?? '')}”${e.searchResults === 0 ? ' <span class="tbadge tbadge--bad">found nothing</span>' : ''}`
      : escapeHtml(e.content_name || shortPath(e.path, 30) || '');

    return `<li class="tfeed__row tfeed__row--${escapeHtml(e.event_name)}">
      ${icon(e.event_name)}
      <span class="tfeed__what"><b>${escapeHtml(eventLabel(e.event_name))}</b> ${what}</span>
      <span class="tfeed__meta">${escapeHtml([
        e.channel ? channelLabel(e.channel) : null,
        e.device ? deviceLabel(e.device) : null,
        e.browser ? browserLabel(e.browser) : null,
      ].filter(Boolean).join(' · '))}</span>
      <span class="tfeed__val">${e.valueTaka ? escapeHtml(taka(e.valueTaka)) : ''}</span>
      <button type="button" class="tfeed__ago tlink" data-session="${escapeHtml(e.session_id ?? '')}" title="Follow this visit">${escapeHtml(ago(e.agoSeconds))}</button>
    </li>`;
  }).join('')}</ul>`;
}
