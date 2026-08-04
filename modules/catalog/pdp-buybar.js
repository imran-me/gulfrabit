/**
 * pdp-buybar.js — the sticky Add to Cart on a phone.
 *
 * A product page is long: gallery, price, description, specs, FAQ, reviews,
 * related products. By the time somebody has read enough to decide, the Add to
 * Cart button is several screens above them and buying costs a scroll back up.
 * This slides a copy into thumb reach the moment the real one leaves view, and
 * takes it away again when it returns.
 *
 * IT IS A DUPLICATE, NOT A REPLACEMENT. Its button forwards the click to the
 * real one, so quantity, stock state, the added-to-cart animation and every
 * future change to that flow keep working with no second implementation to
 * remember. A sticky bar with its own add-to-cart call is how two buy paths
 * drift apart.
 *
 * Self-mounting: it builds its own markup and appends it to <body>, so nothing
 * about it appears in another module's fragment. Deleting this file removes
 * the feature completely.
 */

const HIDE_ABOVE = 1024;   // desktop's buy column is already sticky

export function initBuyBar() {
  const real = document.querySelector('[data-add-to-cart]');
  const info = document.querySelector('.pdp-info');

  if (!real || !info) return;
  if (!('IntersectionObserver' in window)) return;   // no bar rather than a wrong one

  const bar = build(real);
  document.body.append(bar);

  const button = bar.querySelector('[data-buybar-add]');

  button.addEventListener('click', () => {
    // Forwarded, not reimplemented. The real button owns the quantity, the
    // stock check and whatever the cart module does next.
    real.click();
  });

  // The price is read out of the page once, at mount. A size picker changes it
  // afterwards, and a sticky bar quoting the price of a pack the customer has
  // moved off is worse than no bar. The PDP fires this when it repaints.
  document.addEventListener('pdp:pricechange', () => {
    const now = bar.querySelector('.buybar__now');
    const was = bar.querySelector('.buybar__was');
    if (now) now.textContent = readPrice('.pdp-price__now');
    const struck = readPrice('.pdp-price .price--strike');
    if (was) was.textContent = struck;
    else if (struck) {
      now?.insertAdjacentHTML('afterend', `<span class="buybar__was">${escapeHtml(struck)}</span>`);
    }
  });

  const observer = new IntersectionObserver(([entry]) => {
    const offScreen = !entry.isIntersecting;
    const narrow = window.innerWidth < HIDE_ABOVE;

    bar.classList.toggle('is-visible', offScreen && narrow);
  }, {
    // Fires as the button's last pixel leaves rather than when its centre
    // does, so the bar arrives exactly as the control becomes unreachable.
    threshold: 0,
  });

  observer.observe(real);

  // A rotate from portrait to landscape can cross the desktop breakpoint, at
  // which point a bar that is still showing overlaps a buy column that never
  // left. Cheap to re-evaluate; expensive to leave wrong.
  window.addEventListener('resize', () => {
    if (window.innerWidth >= HIDE_ABOVE) bar.classList.remove('is-visible');
  }, { passive: true });
}

/**
 * Read the price out of the page rather than being told it.
 *
 * The PDP script paints the price into `.pdp-price` from the API, and it is
 * already formatted and already correct. Re-deriving it here would be a second
 * place for currency formatting to be slightly different, and the two would
 * disagree on exactly the product where it mattered.
 */
const readPrice = (sel) => document.querySelector(sel)?.textContent?.trim() ?? '';

function build(real) {
  const now = readPrice('.pdp-price__now');
  const was = readPrice('.pdp-price .price--strike');

  const bar = document.createElement('div');
  bar.className = 'buybar';
  // Not aria-hidden when off screen: it is a genuine control and a screen
  // reader user scrolling the page should still reach it. It is visually
  // translated away, not removed.
  bar.innerHTML = `
    <span class="buybar__price">
      <span class="buybar__now">${escapeHtml(now)}</span>
      ${was ? `<span class="buybar__was">${escapeHtml(was)}</span>` : ''}
    </span>
    <button class="btn-gr btn-primary-gr buybar__btn" type="button" data-buybar-add
            ${real.disabled ? 'disabled' : ''}>
      ${escapeHtml(real.textContent.trim() || 'Add to Cart')}
    </button>`;

  return bar;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
