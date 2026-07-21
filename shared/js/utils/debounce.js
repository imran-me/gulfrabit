/**
 * debounce — delay invoking `fn` until `wait` ms have passed since the last call.
 * Used for search-as-you-type, resize handlers, and price-slider input so we
 * don't fire work on every keystroke/frame.
 *
 * @param {Function} fn      function to debounce
 * @param {number}   wait    milliseconds to wait (default 250)
 * @returns {Function}       debounced wrapper (has a .cancel() method)
 */
export function debounce(fn, wait = 250) {
  let timer = null;
  function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  }
  debounced.cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  return debounced;
}
