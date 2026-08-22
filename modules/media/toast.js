/**
 * toast.js — the panel telling you what just happened, and offering it back.
 *
 * WHY NOT THE INLINE NOTE BAR this screen used to have. The bar lived at the
 * bottom of the page. On a library of two hundred images the merchant is
 * scrolled half a screen down, so "Image deleted." was announced somewhere
 * they were not looking, and the only feedback for a successful action was
 * that a thumbnail vanished. A toast appears where the eye already is.
 *
 * WHY UNDO AND NOT A CONFIRM. Filing is high-volume and low-stakes: a merchant
 * moves forty pictures in a sitting and gets one of them wrong. Asking "are you
 * sure?" forty times to catch the one is the wrong trade — it taxes every
 * correct action to insure against a rare one, and taxed confirmations get
 * clicked through without reading, which is worse than not having them.
 * Undo taxes nothing and catches the mistake at the moment it is noticed.
 *
 * Destructive-and-irreversible still asks first. Deleting a file is not
 * filing: there is nothing to undo it with.
 */

const LIFE = 7000;      // long enough to read a sentence and reach for Undo
const LIFE_PLAIN = 4000;

let stack = null;

/**
 * @param {string} message
 * @param {{tone?: 'ok'|'bad'|'info', action?: {label: string, run: Function}}} [opts]
 */
export function toast(message, { tone = 'ok', action = null } = {}) {
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'mtoasts';
    // Announced, not just shown: the merchant may be on a screen reader, and
    // "12 images moved" is the only confirmation there is.
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }

  const el = document.createElement('div');
  el.className = `mtoast is-${tone}`;
  el.innerHTML = `
    <span class="mtoast__icon" aria-hidden="true">${icon(tone)}</span>
    <span class="mtoast__text"></span>
    ${action ? '<button type="button" class="mtoast__act" data-act></button>' : ''}
    <button type="button" class="mtoast__x" data-close aria-label="Dismiss">&times;</button>`;

  // textContent, not innerHTML: several of these carry a folder name typed by
  // a person, and a folder called <img onerror=…> should be a silly name and
  // not a script.
  el.querySelector('.mtoast__text').textContent = message;

  if (action) el.querySelector('[data-act]').textContent = action.label;

  stack.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));

  let timer = setTimeout(() => dismiss(el), action ? LIFE : LIFE_PLAIN);

  // Hovering holds it. Reaching for Undo and watching it slide away first is
  // the single most annoying thing a toast can do.
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(() => dismiss(el), 2500); });

  el.querySelector('[data-close]').addEventListener('click', () => dismiss(el));

  el.querySelector('[data-act]')?.addEventListener('click', async () => {
    clearTimeout(timer);
    el.querySelector('[data-act]').disabled = true;
    await action.run();
    dismiss(el);
  });

  return el;
}

function dismiss(el) {
  el.classList.remove('is-in');
  el.classList.add('is-out');
  setTimeout(() => el.remove(), 220);
}

function icon(tone) {
  if (tone === 'bad') {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>';
  }

  if (tone === 'info') {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>';
  }

  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
}
