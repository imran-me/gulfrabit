/**
 * tracker/footprint.js — one visit, step by step.
 *
 * Opened from anywhere a visit is named: the live list, the visit table, an
 * abandoned checkout. It answers the question those tables raise and cannot
 * settle - "what actually happened to this one?" - and, when the visit ended
 * in an order, links straight to that order.
 *
 * The gap between steps is printed beside each one. Four seconds from opening
 * a product to adding it is a decided buyer; six minutes on the checkout page
 * before leaving is a form that is fighting somebody.
 */

import {
  escapeHtml, num, taka, when, clock, duration, eventLabel,
  channelTag, deviceLine, osLabel, shortPath,
} from './format.js';

const OUTCOME_TONE = {
  delivered: 'ok',
  in_progress: 'info',
  returned: 'warn',
  cancelled: 'bad',
  spam: 'bad',
};

export function paintFootprint(body, sub, d) {
  const s = d.session;
  const events = d.events ?? [];

  if (!s) {
    body.innerHTML = '<p class="tempty">Nothing was recorded for this visit.</p>';
    if (sub) sub.textContent = '';
    return;
  }

  if (sub) {
    sub.textContent = `${when(s.started_at)} · ${duration(s.seconds)} · ${events.length} step${events.length === 1 ? '' : 's'}`;
  }

  const facts = [
    ['Came from', channelTag(s.channel)],
    ['On', deviceLine(s.device, s.browser)],
    ['System', escapeHtml(osLabel(s.os))],
    ['Visitor', s.visit_type === 'returning' ? 'Been here before' : 'First visit'],
    ['Landed on', `<span class="tpath">${escapeHtml(shortPath(s.landing_path, 40))}</span>`],
    ['Referred by', s.referrer_host ? `<span class="tpath">${escapeHtml(s.referrer_host)}</span>` : 'nothing recorded'],
    ['Campaign', s.utm_campaign ? escapeHtml(s.utm_campaign) : '—'],
    ['Pages seen', num(s.pages)],
  ];

  body.innerHTML = `
    <dl class="tfacts">${facts.map(([k, v]) => `
      <div class="tfacts__row"><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`).join('')}
    </dl>

    ${(d.orders ?? []).map((o) => `
      <a class="torder" href="/admin/order?no=${encodeURIComponent(o.orderNumber)}">
        <span class="torder__top">
          <span class="torder__no">${escapeHtml(o.orderNumber)}</span>
          <span class="tchip tchip--${OUTCOME_TONE[o.outcome] ?? 'info'}">${escapeHtml(o.status)}</span>
        </span>
        <span class="torder__meta">${escapeHtml(taka(o.totalTaka))} · ${escapeHtml(o.district ?? '')} · ${escapeHtml(o.paymentMethod ?? '')}</span>
        <span class="torder__go">Open the order <span aria-hidden="true">→</span></span>
      </a>`).join('')}

    <h3 class="tsub">Every step</h3>
    <ol class="ttrail">${events.map((e, i) => {
      const before = i > 0 ? events[i - 1] : null;
      const gap = before ? (new Date(String(e.at).replace(' ', 'T')) - new Date(String(before.at).replace(' ', 'T'))) / 1000 : null;

      const what = e.event_name === 'Search'
        ? `“${escapeHtml(e.search_term ?? '')}”${e.searchResults === 0 ? ' <span class="tbadge tbadge--bad">found nothing</span>' : ` · ${num(e.searchResults)} result${e.searchResults === 1 ? '' : 's'}`}`
        : escapeHtml(e.content_name || shortPath(e.path, 44) || '');

      return `<li class="ttrail__step">
        <span class="ttrail__time">${escapeHtml(clock(e.at))}</span>
        <span class="ttrail__body">
          <span class="ttrail__what"><b>${escapeHtml(eventLabel(e.event_name))}</b> ${what}</span>
          ${e.order ? `<span class="atable__sub">order ${escapeHtml(e.order)}</span>` : ''}
          ${gap != null && gap >= 1 ? `<span class="ttrail__gap">${escapeHtml(duration(gap))} after the step above</span>` : ''}
        </span>
        <span class="ttrail__val">${e.valueTaka ? escapeHtml(taka(e.valueTaka)) : ''}</span>
      </li>`;
    }).join('')}</ol>

    <p class="tnote">Times are the shop's own clock. A step is only recorded when the browser managed to report it —
      an ad blocker or a connection dropped mid-visit leaves gaps here, and the visit was longer than it looks.</p>`;
}
