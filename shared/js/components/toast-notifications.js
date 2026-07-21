/**
 * toast-notifications — small, non-blocking confirmations.
 * Bottom-right on desktop, bottom-centre on mobile (see _animations.css).
 * Auto-dismiss, stackable, accessible (role="status", aria-live polite).
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
  el.innerHTML = `${ICONS[type] || ICONS.info}<span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);

  const remove = () => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Safety net if animationend doesn't fire.
    setTimeout(() => el.remove(), 400);
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => { clearTimeout(timer); remove(); });
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
