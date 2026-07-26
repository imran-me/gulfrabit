/**
 * gift-progress — "spend ৳X more and this is free", with a bar that animates
 * as the basket grows.
 *
 * Owned by the cart module and consumed by both the cart page and the cart
 * drawer, so the two can never drift into showing different thresholds.
 *
 * Styling split follows context.md §2:
 *   · the named component (.gift-progress and its parts) lives in cart.css
 *   · one-off layout here uses Tailwind utilities
 *   · the bar's motion is driven from JS, because it animates between two
 *     runtime values that no stylesheet can know
 *
 * Why the mechanic: a physical gift beats waived delivery at these basket
 * sizes — it costs COGS rather than margin and seeds trial of another SKU —
 * and it lets the delivery promise stay flat and honest. Ghorer Bazar runs the
 * same thing live in their cart drawer.
 */

import { getGiftProgress } from './backend/api.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';

const GIFT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="20" height="20" aria-hidden="true"><path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7A3.5 3.5 0 1 1 8.5 3.5C11 3.5 12 7 12 7z"/><path d="M12 7a3.5 3.5 0 1 0 3.5-3.5C13 3.5 12 7 12 7z"/></svg>';

/**
 * Render (or update) the block inside `host`.
 *
 * Safe to call on every cart change: it reuses the existing markup when the
 * reward has not changed, so the bar animates from its current width instead of
 * snapping back to zero on each keystroke.
 *
 * @param {HTMLElement|null} host
 * @param {number} subtotal goods subtotal in whole BDT
 */
export async function renderGiftProgress(host, subtotal) {
  if (!host) return;

  const gift = await getGiftProgress(subtotal);

  // No live reward, or an empty basket — say nothing rather than showing a
  // 0% bar, which reads as a broken component.
  if (!gift || subtotal <= 0) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }

  host.hidden = false;

  const message = gift.unlocked
    ? `Unlocked — <strong>${escapeHtml(gift.teaser)}</strong> is on us.`
    : `Add <strong>${formatBDT(gift.remaining)}</strong> more for ${escapeHtml(gift.teaser)}.`;

  // Rebuild only when the reward itself changes; otherwise just update the text
  // and let the existing bar transition to its new width.
  if (host.dataset.giftKey !== gift.key) {
    host.dataset.giftKey = gift.key;
    host.innerHTML = `
      <div class="gift-progress__head flex items-start gap-3">
        <span class="gift-progress__icon shrink-0" aria-hidden="true">${GIFT_ICON}</span>
        <p class="gift-progress__msg" data-gift-msg></p>
      </div>
      <div class="gift-progress__track" role="progressbar"
           aria-valuemin="0" aria-valuemax="100" data-gift-track>
        <span class="gift-progress__bar" data-gift-bar></span>
      </div>`;
  }

  host.classList.toggle('is-unlocked', gift.unlocked);
  host.querySelector('[data-gift-msg]').innerHTML = message;

  const track = host.querySelector('[data-gift-track]');
  track.setAttribute('aria-valuenow', String(gift.percent));
  track.setAttribute('aria-label', gift.unlocked
    ? `Gift unlocked: ${gift.label}`
    : `${formatBDT(gift.remaining)} more to unlock ${gift.label}`);

  animateBar(host.querySelector('[data-gift-bar]'), gift.percent);
}

/**
 * Ease the bar to its new width.
 *
 * requestAnimationFrame rather than a CSS transition on width: the element is
 * often created and set in the same frame, and the browser would collapse that
 * into no transition at all. Honours prefers-reduced-motion by jumping.
 */
function animateBar(bar, target) {
  if (!bar) return;

  const from = Number(bar.dataset.pct || 0);
  bar.dataset.pct = String(target);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || from === target) {
    bar.style.width = `${target}%`;
    return;
  }

  const DURATION = 420;
  const start = performance.now();

  const step = (now) => {
    const t = Math.min(1, (now - start) / DURATION);
    // easeOutCubic — fast then settling, matching --ease-out elsewhere.
    const eased = 1 - Math.pow(1 - t, 3);
    bar.style.width = `${from + (target - from) * eased}%`;
    if (t < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

function escapeHtml(str = '') {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
