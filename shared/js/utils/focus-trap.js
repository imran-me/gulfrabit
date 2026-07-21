/**
 * focus-trap — keep keyboard focus inside an open overlay (drawer, modal) and
 * restore it to the trigger on close. Small, dependency-free.
 *
 *   const release = trapFocus(panelEl);   // on open
 *   release();                            // on close (also restores focus)
 */

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusable(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Trap Tab focus within `container`. Returns a release() that removes the trap
 * and returns focus to whatever was focused before (the trigger).
 */
export function trapFocus(container) {
  const previouslyFocused = document.activeElement;

  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const items = getFocusable(container);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  container.addEventListener('keydown', onKeydown);

  // Move focus into the overlay (first focusable, else the container itself).
  const firstFocusable = getFocusable(container)[0];
  (firstFocusable || container).focus?.();

  return function release() {
    container.removeEventListener('keydown', onKeydown);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
  };
}
