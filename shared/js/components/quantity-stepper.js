/**
 * quantity-stepper — enhances any [data-qty-stepper] block.
 * Markup (content-first) lives in the HTML:
 *
 *   <div class="qty-stepper" data-qty-stepper data-min="1" data-max="99">
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

  const clamp = (n) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
  const setVal = (n) => {
    const v = clamp(n);
    input.value = v;
    dec.disabled = v <= min;
    inc.disabled = v >= max;
    stepper.dispatchEvent(new CustomEvent('qty:change', { bubbles: true, detail: { value: v } }));
  };

  dec?.addEventListener('click', () => setVal(Number(input.value) - 1));
  inc?.addEventListener('click', () => setVal(Number(input.value) + 1));
  input?.addEventListener('input', () => { input.value = input.value.replace(/[^\d]/g, ''); });
  input?.addEventListener('change', () => setVal(Number(input.value)));

  setVal(Number(input.value) || min);
}
