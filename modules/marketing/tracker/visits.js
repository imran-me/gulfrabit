/**
 * tracker/visits.js — every visit in the period, one row each.
 *
 * The list exists to be narrowed. "Reached checkout and did not order" is a
 * queue of things to fix; "left after one page" read against the landing page
 * column says which page is doing it. A list of every visit in order is only
 * useful for the minute after an ad goes live - which is what the Live tab is
 * for.
 */

import {
  escapeHtml, num, taka, when, duration, channelTag, deviceLine, stageChip, shortPath,
} from './format.js';

export const OUTCOMES = [
  ['', 'All visits'],
  ['ordered', 'Ordered'],
  ['checkout', 'Reached checkout, did not order'],
  ['cart', 'Carted, no checkout'],
  ['browsed', 'Browsed only'],
  ['bounced', 'Left after one page'],
];

export function paintVisits(host, rows, { outcome, more }) {
  host.innerHTML = `
    <section class="tcard" aria-labelledby="t-visits-h">
      <div class="tcard__head">
        <div>
          <h2 class="tcard__title" id="t-visits-h">Visits</h2>
          <p class="tcard__sub">Newest first. Open one to see every step it took.</p>
        </div>
        <div class="afilters__field tvisits__filter">
          <label for="t-outcome">Show</label>
          <select class="select-gr" id="t-outcome" data-t-outcome>
            ${OUTCOMES.map(([key, word]) => `
              <option value="${key}"${outcome === key ? ' selected' : ''}>${escapeHtml(word)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="atable-wrap"><table class="atable">
        <thead><tr>
          <th scope="col">Started</th>
          <th scope="col">Came from</th>
          <th scope="col">On</th>
          <th scope="col">Landed on</th>
          <th scope="col" class="atable__num">Pages</th>
          <th scope="col" class="atable__num">Time</th>
          <th scope="col">Got as far as</th>
          <th scope="col" class="atable__num">Value</th>
          <th scope="col"><span class="sr-only">Footprint</span></th>
        </tr></thead>
        <tbody data-t-visit-rows>${rows.length ? rowsHtml(rows) : emptyRow()}</tbody>
      </table></div>

      <div class="tmore">
        <button type="button" class="btn-gr btn-gr--ghost" data-t-more${more ? '' : ' hidden'}>Load more visits</button>
      </div>
    </section>`;
}

export function appendVisits(host, rows) {
  const body = host.querySelector('[data-t-visit-rows]');
  if (body) body.insertAdjacentHTML('beforeend', rowsHtml(rows));
}

function emptyRow() {
  return '<tr><td colspan="9" class="atable__empty">No visit in this period matches.</td></tr>';
}

function rowsHtml(rows) {
  return rows.map((s) => `
    <tr>
      <td>${escapeHtml(when(s.started_at))}${s.visit_type === 'returning' ? '<span class="atable__sub">been here before</span>' : ''}</td>
      <td>${channelTag(s.channel)}${s.utm_campaign ? `<span class="atable__sub">${escapeHtml(s.utm_campaign)}</span>` : ''}</td>
      <td>${deviceLine(s.device, s.browser)}</td>
      <td><span class="tpath" title="${escapeHtml(s.landing_path ?? '')}">${escapeHtml(shortPath(s.landing_path, 26))}</span></td>
      <td class="atable__num">${num(s.pages)}</td>
      <td class="atable__num">${escapeHtml(duration(s.seconds))}</td>
      <td>${stageChip(s.stage)}</td>
      <td class="atable__num">${s.revenueTaka
        ? `<b>${escapeHtml(taka(s.revenueTaka))}</b>`
        : s.checkoutTaka ? `<span class="tmuted">${escapeHtml(taka(s.checkoutTaka))}</span>` : '—'}</td>
      <td><button type="button" class="btn-gr btn-gr--ghost" data-session="${escapeHtml(s.session_id)}">Footprint</button></td>
    </tr>`).join('');
}
