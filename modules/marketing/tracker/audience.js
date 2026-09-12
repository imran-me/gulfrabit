/**
 * tracker/audience.js — what the visitors arrived on, when they come, and
 * where in the country their orders go.
 *
 * The browser table is the one to read first in Bangladesh: most of this
 * shop's traffic opens inside Facebook's or Messenger's own browser, which
 * keeps no login between visits and blocks some cookies. A checkout that
 * works in Chrome and fails there loses most of the customers, and no other
 * report in the panel would say so.
 */

import {
  escapeHtml, num, taka, pct, rate, deviceLabel, deviceIcon, browserLabel,
  osLabel, isInApp, hourLabel,
} from './format.js';
import { barList, heatmap } from './charts.js';

export function paintAudience(host, d) {
  const devices = d.devices ?? [];
  const browsers = d.browsers ?? [];
  const visits = devices.reduce((s, r) => s + r.sessions, 0);
  const inApp = browsers.filter((b) => isInApp(b.key)).reduce((s, b) => s + b.sessions, 0);

  host.innerHTML = `
    <div class="tgrid tgrid--2">
      <section class="tcard" aria-labelledby="t-aud-dev">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-aud-dev">Phones, computers, tablets</h2>
          <p class="tcard__sub">Visits, and how many of each ordered.</p>
        </div></div>
        ${barList(devices, {
          label: (r) => `<span class="tdev">${deviceIcon(r.key)}<span>${escapeHtml(deviceLabel(r.key))}</span></span>`,
          value: (r) => r.sessions,
          format: num,
          meta: (r) => `${escapeHtml(pct(rate(r.converted, r.sessions)))} ordered`,
        })}
        ${devices.some((r) => r.key === null) ? '<p class="tnote">Visits recorded before 12 September have no device: the browser string was never stored, and it cannot be recovered.</p>' : ''}
      </section>

      <section class="tcard" aria-labelledby="t-aud-brow">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-aud-brow">Browsers and apps</h2>
          <p class="tcard__sub">${visits > 0 && inApp > 0
            ? `${escapeHtml(pct(rate(inApp, visits)))} of visits open inside an app's own browser, where logins are lost between visits and some cookies never save.`
            : 'Where the shop was opened.'}</p>
        </div></div>
        ${barList(browsers, {
          label: (r) => `${escapeHtml(browserLabel(r.key))}${isInApp(r.key) ? '<span class="tbadge">in-app</span>' : ''}`,
          value: (r) => r.sessions,
          format: num,
          meta: (r) => `${escapeHtml(pct(rate(r.converted, r.sessions)))} ordered`,
        })}
      </section>
    </div>

    <div class="tgrid tgrid--2">
      <section class="tcard" aria-labelledby="t-aud-os">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-aud-os">Operating systems</h2>
        </div></div>
        ${barList(d.os ?? [], {
          label: (r) => escapeHtml(osLabel(r.key)),
          value: (r) => r.sessions,
          format: num,
          meta: (r) => `${escapeHtml(pct(rate(r.converted, r.sessions)))} ordered`,
        })}
      </section>

      <section class="tcard" aria-labelledby="t-aud-new">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-aud-new">First visit or a return</h2>
          <p class="tcard__sub">A cleared browser or a second phone counts as somebody new, so this is a floor.</p>
        </div></div>
        ${visitTypes(d.visitTypes ?? [])}
      </section>
    </div>

    <section class="tcard" aria-labelledby="t-aud-heat">
      <div class="tcard__head"><div>
        <h2 class="tcard__title" id="t-aud-heat">When they come</h2>
        <p class="tcard__sub">Visits by day and hour, Bangladesh time. A dot marks an hour that produced an order. Post, boost and raise budgets just before the dark squares.</p>
      </div></div>
      <div class="theat-wrap" data-t-heat></div>
      <div class="theat-legend">
        <span>Fewer visits</span>
        <span class="theat__cell theat__cell--l1" aria-hidden="true"></span>
        <span class="theat__cell theat__cell--l2" aria-hidden="true"></span>
        <span class="theat__cell theat__cell--l3" aria-hidden="true"></span>
        <span class="theat__cell theat__cell--l4" aria-hidden="true"></span>
        <span class="theat__cell theat__cell--l5" aria-hidden="true"></span>
        <span>More</span>
      </div>
    </section>

    <section class="tcard" aria-labelledby="t-aud-geo">
      <div class="tcard__head"><div>
        <h2 class="tcard__title" id="t-aud-geo">Where the orders go</h2>
        <p class="tcard__sub">${d.geo?.source === 'tracked'
          ? 'Only orders the pixel matched, because a filter is on — an order the pixel never saw has no channel or device to filter by.'
          : 'Every order placed in this period, tracked or not.'}</p>
      </div></div>
      ${geography(d.geo)}
    </section>`;

  const heat = host.querySelector('[data-t-heat]');
  if (heat) {
    heatmap(heat, {
      cells: d.heatmap?.cells ?? [],
      max: d.heatmap?.max ?? 0,
      hourLabel,
      format: num,
    });
  }
}

function visitTypes(rows) {
  const known = rows.filter((r) => r.key);
  if (!known.length) return '<p class="tempty">Nothing in this period yet.</p>';

  const words = { new: 'First visit', returning: 'Been here before' };

  return `<ul class="tsplit">${known.map((r) => `
    <li class="tsplit__item">
      <span class="tsplit__n">${num(r.sessions)}</span>
      <span class="tsplit__l">${escapeHtml(words[r.key] ?? r.key)}</span>
      <span class="tsplit__m">${escapeHtml(pct(rate(r.converted, r.sessions)))} ordered · ${escapeHtml(taka(r.revenueTaka))}</span>
    </li>`).join('')}</ul>`;
}

function geography(geo) {
  if (!geo || !geo.total) {
    return '<p class="tempty">No orders in this period.</p>';
  }

  const inside = rate(geo.insideDhaka, geo.total);

  return `
    <div class="tsplit tsplit--two">
      <div class="tsplit__item">
        <span class="tsplit__n">${num(geo.insideDhaka)}</span>
        <span class="tsplit__l">Inside Dhaka</span>
        <span class="tsplit__m">${escapeHtml(pct(inside))} of orders</span>
      </div>
      <div class="tsplit__item">
        <span class="tsplit__n">${num(geo.outsideDhaka)}</span>
        <span class="tsplit__l">Outside Dhaka</span>
        <span class="tsplit__m">${escapeHtml(pct(100 - (inside ?? 0)))} of orders · higher delivery charge, slower return</span>
      </div>
    </div>

    <div class="atable-wrap"><table class="atable atable--tight">
      <thead><tr>
        <th scope="col">District</th>
        <th scope="col" class="atable__num">Orders</th>
        <th scope="col" class="atable__num">Delivered</th>
        <th scope="col" class="atable__num">Cancelled or returned</th>
        <th scope="col" class="atable__num">Placed value</th>
      </tr></thead>
      <tbody>${geo.districts.map((r) => `
        <tr>
          <td>${escapeHtml(r.district)}</td>
          <td class="atable__num">${num(r.orders)}</td>
          <td class="atable__num">${num(r.delivered)}</td>
          <td class="atable__num">${r.lost ? `<span class="tbad">${num(r.lost)}</span>` : '—'}</td>
          <td class="atable__num">${escapeHtml(taka(r.placedTaka))}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}
