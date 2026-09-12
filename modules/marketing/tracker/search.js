/**
 * tracker/search.js — what people typed into the shop's own search.
 *
 * The "found nothing" table is the most valuable list on this screen, and the
 * one no ad platform can produce: every row is somebody who came wanting
 * something specific, said so in their own words, and was told the shop does
 * not have it. It is a stock list written by customers.
 */

import { escapeHtml, num, pct, rate, when } from './format.js';

export function paintSearch(host, d) {
  const t = d.totals ?? {};
  const empty = d.empty ?? [];
  const terms = d.terms ?? [];

  host.innerHTML = `
    <div class="tgrid tgrid--2">
      <section class="tcard" aria-labelledby="t-search-sum">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-search-sum">Searching and buying</h2>
          <p class="tcard__sub">A visitor who searches has told you what they came for.</p>
        </div></div>
        <ul class="tsplit tsplit--two">
          <li class="tsplit__item">
            <span class="tsplit__n">${escapeHtml(pct(t.searchersPct))}</span>
            <span class="tsplit__l">of visits that searched ordered</span>
            <span class="tsplit__m">${num(t.searchers)} visits used search</span>
          </li>
          <li class="tsplit__item">
            <span class="tsplit__n">${escapeHtml(pct(t.othersPct))}</span>
            <span class="tsplit__l">of visits that did not search ordered</span>
            <span class="tsplit__m">${num(t.others)} visits</span>
          </li>
        </ul>
        <p class="tnote">${num(t.searches)} searches in this period, ${num(t.emptySearches)} of which found nothing.</p>
      </section>

      <section class="tcard tcard--flag" aria-labelledby="t-search-empty">
        <div class="tcard__head"><div>
          <h2 class="tcard__title" id="t-search-empty">Searches that found nothing</h2>
          <p class="tcard__sub">Demand the shop did not meet, in the customer's own words.</p>
        </div></div>
        ${empty.length ? `
          <ul class="tterms">${empty.map((e) => `
            <li class="tterm">
              <span class="tterm__word">“${escapeHtml(e.term)}”</span>
              <span class="tterm__meta">${num(e.searches)} search${e.searches === 1 ? '' : 'es'} · last ${escapeHtml(when(e.lastAt))}</span>
            </li>`).join('')}
          </ul>`
        : '<p class="tempty">Every search in this period found something.</p>'}
      </section>
    </div>

    <section class="tcard" aria-labelledby="t-search-terms">
      <div class="tcard__head"><div>
        <h2 class="tcard__title" id="t-search-terms">What people searched for</h2>
        <p class="tcard__sub">"Went on to cart" and "ordered" count the whole visit, not only what the search itself returned.</p>
      </div></div>
      ${terms.length ? `
      <div class="atable-wrap"><table class="atable">
        <thead><tr>
          <th scope="col">Words</th>
          <th scope="col" class="atable__num">Searches</th>
          <th scope="col" class="atable__num">Visits</th>
          <th scope="col" class="atable__num">Found nothing</th>
          <th scope="col" class="atable__num">Went on to cart</th>
          <th scope="col" class="atable__num">Ordered</th>
          <th scope="col">Last searched</th>
        </tr></thead>
        <tbody>${terms.map((r) => `
          <tr>
            <td><span class="tname">${escapeHtml(r.term)}</span></td>
            <td class="atable__num">${num(r.searches)}</td>
            <td class="atable__num">${num(r.sessions)}</td>
            <td class="atable__num">${r.empty ? `<span class="tbad">${num(r.empty)}</span>` : '—'}</td>
            <td class="atable__num">${num(r.carted)}</td>
            <td class="atable__num">${r.converted ? `<b>${num(r.converted)}</b>` : '—'}
              <span class="atable__sub">${escapeHtml(pct(rate(r.converted, r.sessions)))}</span></td>
            <td>${escapeHtml(when(r.lastAt))}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`
      : '<p class="tempty">Nobody used the search in this period.</p>'}
    </section>`;
}
