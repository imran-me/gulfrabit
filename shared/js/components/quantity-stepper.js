/**
 * quantity-stepper — enhances any [data-qty-stepper] block.
 * Markup (content-first) lives in the HTML:
 *
 *   <div class="qty-stepper" data-qty-stepper data-min="1" data-max="99" data-step="1">
 *     <button class="qty-stepper__btn" data-qty-dec aria-label="Decrease">−</button>
 *     <input class="qty-stepper__input" data-qty-input value="1" inputmode="numeric" aria-label="Quantity">
 *     <button class="qty-stepper__btn" data-qty-inc aria-label="Increase">+</button>
 *   </div>
 *
 * Emits a `qty:change` CustomEvent (detail:{value}) so pages can react
 * (e.g. update a PDP price total) without this module knowing about them.
 */

export function initQuantitySteppers(root = document) {
  root.querySelectorAll('[data-qty-stepper]').forEach(setup);
}

export function setup(stepper) {
  if (stepper.dataset.ready) return;
  stepper.dataset.ready = 'true';
  const input = stepper.querySelector('[data-qty-input]');
  const dec = stepper.querySelector('[data-qty-dec]');
  const inc = stepper.querySelector('[data-qty-inc]');
  const min = Number(stepper.dataset.min ?? 1);
  const max = Number(stepper.dataset.max ?? 99);
  // Industrial parts are sold in reels and sacks, so ± has to move by the pack
  // size. Stepping by 1 from a 1,000-unit minimum is 9,000 clicks to the next
  // price tier.
  const step = Math.max(1, Number(stepper.dataset.step ?? 1));

  const clamp = (n) => {
    if (!Number.isFinite(n)) return min;
    // Snap to the step grid measured from `min`, not from zero: a minimum of 50
    // stepping by 50 must produce 50/100/150, and a minimum of 100 stepping by
    // 1,000 must not silently become 1,000.
    const snapped = min + Math.round((n - min) / step) * step;
    return Math.max(min, Math.min(max, snapped));
  };
  const setVal = (n) => {
    const v = clamp(n);
    input.value = v;
    // Mirror to the attribute as well as the property. Setting only the
    // property leaves the DOM claiming the old quantity, so a cloned stepper
    // resets to its authored value and any tooling that reads the markup sees
    // a number the user never chose.
    input.setAttribute('value', String(v));
    dec.disabled = v <= min;
    inc.disabled = v >= max;
    stepper.dispatchEvent(new CustomEvent('qty:change', { bubbles: true, detail: { value: v } }));
  };

  dec?.addEventListener('click', () => setVal(Number(input.value) - step));
  inc?.addEventListener('click', () => setVal(Number(input.value) + step));
  input?.addEventListener('input', () => { input.value = input.value.replace(/[^\d]/g, ''); });
  input?.addEventListener('change', () => setVal(Number(input.value)));

  setVal(Number(input.value) || min);
}
