/**
 * tracker/checkout.js — the last step, and what it loses.
 *
 * THREE QUESTIONS, IN ORDER OF WHAT THEY ARE WORTH
 *
 *   1. What was left at checkout, and what was in it. Not names or phone
 *      numbers - this module has never collected either and will not start -
 *      but the cart, the device, the app and the ad that brought the visit.
 *      "Eleven visits from one ad, all inside the Facebook app, all stopped
 *      at the same screen" is the more useful sentence anyway.
 *   2. Where checkout completes and where it does not. An in-app browser row
 *      far below the others is a checkout that breaks where most of this
 *      shop's customers actually are.
 *   3. Whether the pixel and the order book agree. A tracked purchase with no
 *      order behind it is a checkout that failed after the tap; an order with
 *      no tracked purchase is a sale Meta never learned about.
 */

import {
  escapeHtml, num, taka, pct, rate, when, duration, channelTag, deviceLine,
  browserLabel, deviceLabel, isInApp, shortPath,
} from './format.js';
import { barList, statusBar, statusLegend, OUTCOME_KEYS, OUTCOME_LABELS } from './charts.js';

export function paintCheckout(host, d) {
  const ab = d.abandoned ?? { count: 0, valueTaka: 0, rows: [] };
  const steps = d.steps ?? {};
  const orders = d.orders ?? {};
  const completed = rate(steps.converted, steps.checkouts);

  host.innerHTML = `
    <section class="tcard" aria-labelledby="t-co-h">
      <div class="tcard__head"><div>
        <h2 class="tcard__title" id="t-co-h">The last step</h2>
        <p class="tcard__sub">Of the visits that reached checkout in this period.</p>
      </div></div>
      <ul class="tsplit tsplit--three">
        <li class="tsplit__item">
          <span class="tsplit__n">${escapeHtml(taka(ab.valueTaka))}</span>
          <span class="tsplit__l">left at checkout</span>
          <span class="tsplit__m">${num(ab.count)} visit${ab.count === 1 ? '' : 's'} started and did not finish</span>
        </li>
        <li class="tsplit__item">
          <span class="tsplit__n">${escapeHtml(pct(completed))}</span>
          <span class="tsplit__l">of checkouts finished</span>
          <span class="tsplit__m">${num(steps.converted)} of ${num(steps.checkouts)}</span>
        </li>
        <li class="tsplit__item">
          <span class="tsplit__n">${num(steps.cartOnly)}</span>
          <span class="tsplit__l">carts that never reached checkout</span>
          <span class="tsplit__m">added something, then left</span>
        </li>
      </ul>
    </section>

    <div class="tgrid tgrid--2">
      <section class="tcard" aria-labelledby="t-co-brow">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-co-brow">Where checkout finishes</h2>
          <p class="tcard__sub">Of the checkouts started in each browser, the share that ended in an order.</p>
        </div></div>
        ${completion(d.completion?.browsers ?? [], (k) => `${escapeHtml(browserLabel(k))}${isInApp(k) ? '<span class="tbadge">in-app</span>' : ''}`)}
      </section>

      <section class="tcard" aria-labelledby="t-co-dev">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-co-dev">…and on what</h2>
          <p class="tcard__sub">The same, by device.</p>
        </div></div>
        ${completion(d.completion?.devices ?? [], (k) => escapeHtml(deviceLabel(k)))}
      </section>
    </div>

    <section class="tcard" aria-labelledby="t-co-ab">
      <div class="tcard__head"><div>
        <h2 class="tcard__title" id="t-co-ab">What was left behind</h2>
        <p class="tcard__sub">The newest ${num(ab.rows.length)} of them. No name or phone number is recorded for a visit that did not order — there is nothing here to call, only something to fix.</p>
      </div></div>
      ${abandonedTable(ab.rows)}
    </section>

    <section class="tcard" aria-labelledby="t-co-rec">
      <div class="tcard__head"><div>
        <h2 class="tcard__title" id="t-co-rec">Does the pixel agree with the order book?</h2>
        <p class="tcard__sub">Every tracked purchase carries the id the checkout wrote on its order, so the two can be matched one by one.</p>
      </div></div>
      ${reconciliation(orders)}
      ${(d.unmatched ?? []).length ? unmatched(d.unmatched) : ''}
    </section>`;
}

function completion(rows, label) {
  const known = rows.filter((r) => r.key);
  if (!known.length) return '<p class="tempty">No checkout was started in this period.</p>';

  return `${barList(known, {
    label: (r) => label(r.key),
    value: (r) => r.pct ?? 0,
    format: (v) => pct(v),
    max: 100,
    meta: (r) => `${num(r.converted)} of ${num(r.checkouts)}`,
  })}
  <p class="tnote">Bars are the share that finished, so they can be compared with each other whatever the number of checkouts behind them.</p>`;
}

function abandonedTable(rows) {
  if (!rows.length) {
    return '<p class="tempty">Every checkout in this period ended in an order.</p>';
  }

  return `<div class="atable-wrap"><table class="atable">
    <thead><tr>
      <th scope="col">When</th>
      <th scope="col">Came from</th>
      <th scope="col">On</th>
      <th scope="col">In the cart</th>
      <th scope="col" class="atable__num">Worth</th>
      <th scope="col"><span class="sr-only">Footprint</span></th>
    </tr></thead>
    <tbody>${rows.map((r) => `
      <tr>
        <td>${escapeHtml(when(r.ended_at))}<span class="atable__sub">${escapeHtml(duration(
          (new Date(String(r.ended_at).replace(' ', 'T')) - new Date(String(r.started_at).replace(' ', 'T'))) / 1000,
        ))} on the shop</span></td>
        <td>${channelTag(r.channel)}${r.utm_campaign ? `<span class="atable__sub">${escapeHtml(r.utm_campaign)}</span>` : ''}
          <span class="atable__sub">landed on ${escapeHtml(shortPath(r.landing_path, 28))}</span></td>
        <td>${deviceLine(r.device, r.browser)}</td>
        <td>${r.products?.length
          ? `<span class="tprod__text">${r.products.slice(0, 3).map((p) => `<span class="tname">${escapeHtml(p)}</span>`).join('')}
             ${r.products.length > 3 ? `<span class="atable__sub">and ${num(r.products.length - 3)} more</span>` : ''}</span>`
          : '<span class="atable__sub">not recorded</span>'}${
            r.items ? `<span class="atable__sub">${num(r.items)} item${r.items === 1 ? '' : 's'}</span>` : ''}</td>
        <td class="atable__num">${escapeHtml(taka(r.valueTaka))}</td>
        <td><button type="button" class="btn-gr btn-gr--ghost" data-session="${escapeHtml(r.session_id)}">Footprint</button></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function reconciliation(o) {
  const matched = o.matched ?? 0;

  return `
    <ul class="tsplit tsplit--three">
      <li class="tsplit__item">
        <span class="tsplit__n">${num(o.tracked)}</span>
        <span class="tsplit__l">purchases the pixel recorded</span>
        <span class="tsplit__m">${num(matched)} matched to a real order</span>
      </li>
      <li class="tsplit__item">
        <span class="tsplit__n">${o.ordersInWindow == null ? '—' : num(o.ordersInWindow)}</span>
        <span class="tsplit__l">orders actually placed</span>
        <span class="tsplit__m">${o.untracked == null
          ? 'not comparable while a filter is on'
          : `${num(o.untracked)} of them were never tracked`}</span>
      </li>
      <li class="tsplit__item">
        <span class="tsplit__n">${escapeHtml(taka(o.deliveredTaka))}</span>
        <span class="tsplit__l">delivered and paid for</span>
        <span class="tsplit__m">of ${escapeHtml(taka(o.placedTaka))} placed</span>
      </li>
    </ul>

    ${statusLegend()}
    <div class="tstatus-row">${statusBar(o.byStatus ?? {})}</div>
    <ul class="tcounts">${OUTCOME_KEYS.map((k) => `
      <li><span class="tcounts__n">${num((o.byStatus ?? {})[k] ?? 0)}</span> ${escapeHtml(OUTCOME_LABELS[k])}</li>`).join('')}
    </ul>
    ${o.coveragePct != null ? `<p class="tnote">The pixel saw ${escapeHtml(pct(o.coveragePct))} of the orders placed in this period.
      The rest are ad blockers, a connection lost at the moment of ordering, or orders entered by staff — Meta did not see those either.</p>` : ''}`;
}

function unmatched(rows) {
  return `
    <h3 class="tsub">Purchases with no order behind them</h3>
    <p class="tcard__sub">The pixel saw "Place order" pressed and no order exists — a checkout that failed after the tap, or the button pressed twice. Meta counted these as sales.</p>
    <div class="atable-wrap"><table class="atable atable--tight">
      <thead><tr>
        <th scope="col">When</th>
        <th scope="col">Came from</th>
        <th scope="col" class="atable__num">Reported value</th>
        <th scope="col"><span class="sr-only">Footprint</span></th>
      </tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td>${escapeHtml(when(r.at))}</td>
          <td>${channelTag(r.channel)}${r.browser ? `<span class="atable__sub">${escapeHtml(browserLabel(r.browser))}</span>` : ''}</td>
          <td class="atable__num">${escapeHtml(taka(r.valueTaka))}</td>
          <td>${r.session_id ? `<button type="button" class="tlink" data-session="${escapeHtml(r.session_id)}">Footprint</button>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}
