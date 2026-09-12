/**
 * tracker/sources.js — where the visits came from, and what their orders
 * turned into.
 *
 * Two tables that look similar and are not, which the page says out loud:
 *
 *   Channels     how each visit ARRIVED - the referrer, the click id, the
 *                in-app browser. A visitor first recruited by an ad who comes
 *                back on their own is a Direct visit here.
 *   Campaigns    the ad that FIRST brought the visitor, kept for as long as
 *                the browser keeps it. The same return visit still belongs to
 *                the campaign here, because the campaign is what earned it.
 *
 * The third table is the one an ad dashboard cannot show at all: what became
 * of the orders each channel produced. A cash-on-delivery order is a promise -
 * the channel that brings promises nobody keeps is costing courier fees, and
 * it looks identical to a good one until the parcels come back.
 */

import { escapeHtml, num, taka, pct, rate, channelTag, shortPath } from './format.js';
import { barList, statusBar, statusLegend, OUTCOME_KEYS, OUTCOME_LABELS } from './charts.js';

export function paintSources(host, d) {
  host.innerHTML = `
    <section class="tcard" aria-labelledby="t-src-ch">
      <div class="tcard__head"><div>
        <h2 class="tcard__title" id="t-src-ch">Channels</h2>
        <p class="tcard__sub">How each visit arrived. Facebook, Messenger and Instagram hide the referring page often enough that a shop's social traffic usually lands in "Direct" — the in-app browser is read here instead, so it does not.</p>
      </div></div>
      ${breakdownTable(d.channels ?? [], 'Channel', (r) => channelTag(r.key))}
    </section>

    <section class="tcard" aria-labelledby="t-src-out">
      <div class="tcard__head"><div>
        <h2 class="tcard__title" id="t-src-out">What became of each channel's orders</h2>
        <p class="tcard__sub">Only the orders the pixel matched to a real order. Delivered revenue is money; placed revenue is a forecast.</p>
      </div></div>
      ${outcomes(d.outcomes ?? [])}
    </section>

    <section class="tcard" aria-labelledby="t-src-camp">
      <div class="tcard__head"><div>
        <h2 class="tcard__title" id="t-src-camp">Campaigns</h2>
        <p class="tcard__sub">By the utm tags the visitor first arrived with, kept for every later visit from that browser.</p>
      </div></div>
      ${campaignTable(d.campaigns ?? [])}
    </section>

    ${(d.ads ?? []).length ? `
    <section class="tcard" aria-labelledby="t-src-ads">
      <div class="tcard__head"><div>
        <h2 class="tcard__title" id="t-src-ads">Individual ads</h2>
        <p class="tcard__sub">From utm_content. Ads Manager reports these as clicks; this reports them as orders.</p>
      </div></div>
      ${adTable(d.ads)}
    </section>` : ''}

    <div class="tgrid tgrid--2">
      <section class="tcard" aria-labelledby="t-src-land">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-src-land">Landing pages</h2>
          <p class="tcard__sub">The first page of each visit — where an ad's money actually lands.</p>
        </div></div>
        ${landingTable(d.landings ?? [])}
      </section>

      <section class="tcard" aria-labelledby="t-src-ref">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-src-ref">Referring websites</h2>
          <p class="tcard__sub">Pages elsewhere that link here.</p>
        </div></div>
        ${barList(d.referrers ?? [], {
          label: (r) => `<span class="tpath">${escapeHtml(r.host)}</span>`,
          value: (r) => r.sessions,
          format: num,
        })}
      </section>
    </div>`;
}

/** The shared shape of every visit breakdown: channels, devices, landing pages. */
export function breakdownTable(rows, heading, label, extra = {}) {
  if (!rows.length) return '<p class="tempty">Nothing in this period yet.</p>';

  const total = rows.reduce((s, r) => s + r.sessions, 0);

  return `<div class="atable-wrap"><table class="atable">
    <thead><tr>
      <th scope="col">${escapeHtml(heading)}</th>
      <th scope="col" class="atable__num">Visits</th>
      <th scope="col" class="atable__num">Share</th>
      <th scope="col" class="atable__num">Left after one page</th>
      <th scope="col" class="atable__num">Added to cart</th>
      <th scope="col" class="atable__num">Orders</th>
      <th scope="col" class="atable__num">Ordered</th>
      <th scope="col" class="atable__num">Revenue</th>
    </tr></thead>
    <tbody>${rows.map((r) => `
      <tr>
        <td>${label(r)}${extra.note ? extra.note(r) : ''}</td>
        <td class="atable__num">${num(r.sessions)}</td>
        <td class="atable__num">${escapeHtml(pct(rate(r.sessions, total)))}</td>
        <td class="atable__num">${escapeHtml(pct(rate(r.bounced, r.sessions)))}</td>
        <td class="atable__num">${escapeHtml(pct(rate(r.carted, r.sessions)))}</td>
        <td class="atable__num">${num(r.orders)}</td>
        <td class="atable__num"><b>${escapeHtml(pct(rate(r.converted, r.sessions)))}</b></td>
        <td class="atable__num">${escapeHtml(taka(r.revenueTaka))}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function campaignTable(rows) {
  if (!rows.length) {
    return `<p class="tempty">No visit in this period carried a campaign tag. Add utm tags to the links in your ads — <code>?utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign=eid-offer</code> — and each ad's visits, orders and revenue appear here.</p>`;
  }

  return breakdownTable(rows, 'Campaign', (r) => `
    <span class="tname">${escapeHtml(r.campaign || '(no campaign)')}</span>
    <span class="atable__sub">${escapeHtml([r.source, r.medium].filter(Boolean).join(' · ') || 'no source tag')}</span>`);
}

function adTable(rows) {
  return breakdownTable(rows, 'Ad', (r) => `
    <span class="tname">${escapeHtml(r.content)}</span>
    <span class="atable__sub">${escapeHtml(r.campaign || '(no campaign)')}</span>`);
}

function landingTable(rows) {
  if (!rows.length) return '<p class="tempty">Nothing in this period yet.</p>';

  return `<div class="atable-wrap"><table class="atable atable--tight">
    <thead><tr>
      <th scope="col">Page</th>
      <th scope="col" class="atable__num">Visits</th>
      <th scope="col" class="atable__num">Left after one page</th>
      <th scope="col" class="atable__num">Ordered</th>
    </tr></thead>
    <tbody>${rows.map((r) => `
      <tr>
        <td><span class="tpath" title="${escapeHtml(r.key ?? '')}">${escapeHtml(shortPath(r.key, 44))}</span></td>
        <td class="atable__num">${num(r.sessions)}</td>
        <td class="atable__num">${escapeHtml(pct(rate(r.bounced, r.sessions)))}</td>
        <td class="atable__num">${escapeHtml(pct(rate(r.converted, r.sessions)))}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function outcomes(rows) {
  if (!rows.length) {
    return '<p class="tempty">No tracked purchase in this period has been matched to an order yet.</p>';
  }

  return `
    ${statusLegend()}
    <div class="atable-wrap"><table class="atable">
      <thead><tr>
        <th scope="col">Channel</th>
        <th scope="col" class="atable__num">Orders</th>
        <th scope="col">What happened</th>
        ${OUTCOME_KEYS.map((k) => `<th scope="col" class="atable__num">${escapeHtml(OUTCOME_LABELS[k])}</th>`).join('')}
        <th scope="col" class="atable__num">Delivered</th>
        <th scope="col" class="atable__num">Placed</th>
      </tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td>${channelTag(r.channel)}</td>
          <td class="atable__num">${num(r.orders)}</td>
          <td class="tstatus-cell">${statusBar(r)}</td>
          ${OUTCOME_KEYS.map((k) => `<td class="atable__num">${r[k] ? num(r[k]) : '—'}</td>`).join('')}
          <td class="atable__num"><b>${escapeHtml(taka(r.deliveredTaka))}</b></td>
          <td class="atable__num">${escapeHtml(taka(r.placedTaka))}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <p class="tnote">Delivered is the only column that has been paid for. An order still in progress may yet become either of the two beside it.</p>`;
}
