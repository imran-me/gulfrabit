/**
 * validate-form — tiny, dependency-free client-side validation.
 *
 * Declarative: annotate fields with data-attributes in the HTML, then call
 * validateForm(formEl). Content stays in HTML; JS only checks and flags.
 *
 *   <div class="field-gr" data-field>
 *     <label class="label-gr" for="email">Email</label>
 *     <input id="email" class="input-gr" type="email"
 *            data-validate="required|email" data-label="Email">
 *     <span class="field-error" data-error></span>
 *   </div>
 *
 * Supported rules: required, email, phone (BD), min:N, max:N, match:#otherId,
 * numeric. Rules are pipe-separated.
 *
 * NOTE (backend): this is UX-layer validation only. The Laravel API must
 * re-validate every field server-side — never trust the client. // TODO: backend
 */

const RULES = {
  required: (v) => v.trim().length > 0 || 'This field is required.',
  email:    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email address.',
  phone:    (v) => !v || /^(\+?880|0)1[3-9]\d{8}$/.test(v.replace(/[\s-]/g, '')) || 'Enter a valid Bangladeshi mobile number.',
  numeric:  (v) => !v || /^\d+$/.test(v) || 'Numbers only.',
};

function ruleWithArg(name, arg, v, form) {
  switch (name) {
    case 'min':   return v.length >= +arg || `Must be at least ${arg} characters.`;
    case 'max':   return v.length <= +arg || `Must be at most ${arg} characters.`;
    case 'match': {
      const other = form.querySelector(arg);
      return (other && v === other.value) || 'Values do not match.';
    }
    default: return true;
  }
}

/** Validate a single input element. Returns true|false and updates its field UI. */
export function validateField(input, form) {
  const spec = input.getAttribute('data-validate');
  if (!spec) return true;
  // For checkboxes, `value` is the literal "on" regardless of checked state —
  // normalise so `required` (and friends) reflect whether it's actually ticked.
  const value = (input.type === 'checkbox' || input.type === 'radio')
    ? (input.checked ? input.value || 'on' : '')
    : (input.value ?? '');
  let error = '';

  for (const token of spec.split('|')) {
    const [name, arg] = token.split(':');
    const result = arg != null
      ? ruleWithArg(name, arg, value, form)
      : (RULES[name] ? RULES[name](value) : true);
    if (result !== true) { error = result; break; }
  }

  const field = input.closest('[data-field]') || input.closest('.field-gr');
  const errEl = field?.querySelector('[data-error]');
  if (field) {
    field.classList.toggle('is-invalid', !!error);
    field.classList.toggle('is-valid', !error && value.trim() !== '');
  }
  if (errEl) errEl.textContent = error;
  return !error;
}

/**
 * Validate a whole form. Returns { valid, values }.
 * Focuses the first invalid field for accessibility.
 */
export function validateForm(form) {
  const inputs = form.querySelectorAll('[data-validate]');
  let valid = true;
  let firstInvalid = null;
  const values = {};

  inputs.forEach((input) => {
    const ok = validateField(input, form);
    if (!ok && !firstInvalid) firstInvalid = input;
    if (!ok) valid = false;
    if (input.name) values[input.name] = input.value;
  });

  if (firstInvalid) firstInvalid.focus();
  return { valid, values };
}

/** Wire live validation: revalidate a field on blur once it has been touched. */
export function attachLiveValidation(form) {
  form.querySelectorAll('[data-validate]').forEach((input) => {
    input.addEventListener('blur', () => validateField(input, form));
    input.addEventListener('input', () => {
      const field = input.closest('[data-field]') || input.closest('.field-gr');
      if (field?.classList.contains('is-invalid')) validateField(input, form);
    });
  });
}
