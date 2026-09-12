/**
 * tracker/products.js — which products get looked at, and which get bought.
 *
 * The gap between those two is the report. A product forty visits opened and
 * one carted is not an unpopular product: it is a product whose price, photos
 * or description is turning people away at the last moment, and it is the
 * cheapest thing in a shop to fix. A product that is out of stock and still
 * being opened is demand walking out of the door.
 *
 * The flags say which is which in words. They are deliberately rare - a flag
 * on every row is a flag nobody reads - so they only appear once there are
 * enough visits for the rate to mean anything.
 */

import { escapeHtml, num, taka, pct } from './format.js';

const SORTS = [
  ['views', 'Most looked at'],
  ['carts', 'Most carted'],
  ['orders', 'Most ordered'],
  ['wishlist', 'Most saved'],
  ['cart_rate', 'Best look → cart'],
  ['order_rate', 'Best look → order'],
];

const FLAGS = {
  'oos-demand': { word: 'Out of stock, still wanted', tone: 'bad' },
  'look-not-add': { word: 'Looked at, rarely added', tone: 'warn' },
  'cart-not-buy': { word: 'Carted, rarely bought', tone: 'warn' },
  star: { word: 'Sells to the people who see it', tone: 'ok' },
};

export function paintProducts(host, d) {
  const rows = d.products ?? [];
  const t = d.totals ?? {};

  host.innerHTML = `
    <section class="tcard" aria-labelledby="t-prod-h">
      <div class="tcard__head">
        <div>
          <h2 class="tcard__title" id="t-prod-h">Products</h2>
          <p class="tcard__sub">${num(t.products)} products were opened, saved or carted in this period —
            ${num(t.views)} looks, ${num(t.carts)} carted, ${num(t.orders)} ordered.</p>
        </div>
        <div class="tseg" role="radiogroup" aria-label="Order the products by" data-t-product-sort>
          ${SORTS.map(([key, word]) => `
            <button type="button" role="radio" aria-checked="${d.sort === key ? 'true' : 'false'}"
              class="${d.sort === key ? 'is-on' : ''}" data-sort="${key}">${escapeHtml(word)}</button>`).join('')}
        </div>
      </div>

      ${rows.length ? table(rows) : '<p class="tempty">No product was opened in this period.</p>'}

      <ul class="tflags-key">
        ${Object.entries(FLAGS).map(([, f]) => `<li><span class="tflag tflag--${f.tone}">${escapeHtml(f.word)}</span></li>`).join('')}
      </ul>
      <p class="tnote">Looks and carts count VISITS, not clicks: one shopper opening a product six times is one look.
        A flag needs at least fifteen looks, or five carts, before it appears.</p>
    </section>`;
}

function table(rows) {
  return `<div class="atable-wrap"><table class="atable">
    <thead><tr>
      <th scope="col">Product</th>
      <th scope="col" class="atable__num">Looked at</th>
      <th scope="col" class="atable__num">Saved</th>
      <th scope="col" class="atable__num">Carted</th>
      <th scope="col" class="atable__num">Ordered</th>
      <th scope="col" class="atable__num">Look → cart</th>
      <th scope="col" class="atable__num">Look → order</th>
      <th scope="col">Funnel</th>
    </tr></thead>
    <tbody>${rows.map((p) => {
      const stock = p.inStock === false
        ? '<span class="tflag tflag--bad">Out of stock</span>'
        : p.stockQty != null && p.stockQty <= 5
          ? `<span class="tflag tflag--warn">${num(p.stockQty)} left</span>`
          : '';

      return `<tr>
        <td>
          <span class="tprod">
            ${p.image
              ? `<img class="tprod__img" src="${escapeHtml(p.image)}" alt="" loading="lazy" width="40" height="40">`
              : '<span class="tprod__img tprod__img--none" aria-hidden="true"></span>'}
            <span class="tprod__text">
              <span class="tname">${escapeHtml(p.name)}</span>
              <span class="atable__sub">${escapeHtml(p.id)}${p.priceTaka != null ? ` · ${taka(p.priceTaka)}` : ''}</span>
              <span class="tprod__flags">${stock}${(p.flags ?? []).map((f) => FLAGS[f]
                ? `<span class="tflag tflag--${FLAGS[f].tone}">${escapeHtml(FLAGS[f].word)}</span>`
                : '').join('')}</span>
            </span>
          </span>
        </td>
        <td class="atable__num">${num(p.views)}</td>
        <td class="atable__num">${p.wishlist ? num(p.wishlist) : '—'}</td>
        <td class="atable__num">${num(p.carts)}</td>
        <td class="atable__num">${num(p.orders)}</td>
        <td class="atable__num">${escapeHtml(pct(p.viewToCartPct))}</td>
        <td class="atable__num"><b>${escapeHtml(pct(p.viewToOrderPct))}</b></td>
        <td>${miniFunnel(p)}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

/**
 * Three bars against the same scale - looks, carts, orders - so the narrowing
 * is visible without reading three numbers. The numbers are in the row beside
 * it; this is the shape only.
 */
function miniFunnel(p) {
  const top = Math.max(1, p.views, p.carts, p.orders);
  const bar = (v, name) => `<span class="tmini__bar" style="width:${((v / top) * 100).toFixed(1)}%" title="${escapeHtml(`${name}: ${num(v)}`)}"></span>`;

  return `<span class="tmini" role="img" aria-label="${escapeHtml(`Looked at ${p.views}, carted ${p.carts}, ordered ${p.orders}`)}">
    ${bar(p.views, 'Looked at')}${bar(p.carts, 'Carted')}${bar(p.orders, 'Ordered')}
  </span>`;
}
