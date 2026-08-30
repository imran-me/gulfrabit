/**
 * toast-notifications — small, non-blocking confirmations.
 * Bottom-right on desktop, bottom-centre on mobile (see _animations.css).
 * Auto-dismiss, stackable, accessible (role="status", aria-live polite).
 * The countdown pauses while the toast is hovered or holds focus, so a long
 * message is never yanked away mid-read.
 *
 * Usage:  import { toast } from '.../toast-notifications.js';
 *         toast.success('Added to cart');
 *         toast.error('Something went wrong');
 *         toast.info('Removed from wishlist');
 */

let stackEl = null;

function ensureStack() {
  if (stackEl) return stackEl;
  stackEl = document.querySelector('.toast-stack');
  if (!stackEl) {
    stackEl = document.createElement('div');
    stackEl.className = 'toast-stack';
    stackEl.setAttribute('aria-live', 'polite');
    stackEl.setAttribute('aria-atomic', 'false');
    document.body.appendChild(stackEl);
  }
  return stackEl;
}

const ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-gr__icon"><path d="M20 6 9 17l-5-5"/></svg>',
  error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-gr__icon"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="toast-gr__icon"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
};

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} [type]
 * @param {number} [duration] ms before auto-dismiss (default 3200)
 */
export function showToast(message, type = 'info', duration = 3200) {
  const stack = ensureStack();
  const el = document.createElement('div');
  el.className = `toast-gr toast-gr--${type}`;
  el.setAttribute('role', 'status');
  el.style.setProperty('--toast-life', `${duration}ms`);
  el.innerHTML =
    `${ICONS[type] || ICONS.info}` +
    `<span class="toast-gr__msg">${escapeHtml(message)}</span>` +
    `<button type="button" class="toast-gr__close" aria-label="Dismiss">${CLOSE_ICON}</button>` +
    `<span class="toast-gr__timer" aria-hidden="true"></span>`;
  stack.appendChild(el);

  let dismissed = false;
  let timer = 0;
  const remove = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Safety net if animationend doesn't fire.
    setTimeout(() => el.remove(), 400);
  };

  // The countdown is JS-owned so that prefers-reduced-motion — which flattens
  // every animation to ~0ms — cannot dismiss the toast before it is read. The
  // bar is only the picture of it.
  let remaining = duration;
  let startedAt = now();
  const pause = () => {
    if (dismissed || el.classList.contains('is-paused')) return;
    clearTimeout(timer);
    remaining -= now() - startedAt;
    el.classList.add('is-paused');
  };
  const resume = () => {
    if (dismissed || !el.classList.contains('is-paused')) return;
    el.classList.remove('is-paused');
    if (remaining <= 0) { remove(); return; }
    startedAt = now();
    timer = setTimeout(remove, remaining);
  };
  timer = setTimeout(remove, remaining);

  // Hover-to-pause is a fine-pointer idea. A touch "enter" has no matching
  // "leave" if the finger is lifted elsewhere, which would strand the toast
  // paused forever — so touch is left to the tap-to-dismiss path below.
  el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') pause(); });
  el.addEventListener('pointerleave', resume);
  el.addEventListener('pointercancel', resume);
  el.addEventListener('focusin', pause);
  el.addEventListener('focusout', resume);
  el.addEventListener('click', remove);
  // The button carries its own handler so keyboard Enter/Space reach it too.
  el.querySelector('.toast-gr__close').addEventListener('click', (e) => {
    e.stopPropagation();
    remove();
  });
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export const toast = {
  success: (m, d) => showToast(m, 'success', d),
  error:   (m, d) => showToast(m, 'error', d),
  info:    (m, d) => showToast(m, 'info', d),
};
