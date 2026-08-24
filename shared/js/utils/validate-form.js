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
 * WHY data-label MATTERS. Every message below is written from it. Submitting
 * the checkout form empty used to print "This field is required." four times
 * down the page, which on a phone is four identical sentences and no way to
 * tell which one belongs to which box once you have scrolled. Now it reads
 * "Enter your full name", "Enter your phone", and so on — the same amount of
 * markup, a message that survives being read on its own.
 *
 * NOTE (backend): this is UX-layer validation only. The Laravel API must
 * re-validate every field server-side — never trust the client. // TODO: backend
 */

/* ------------------------------------------------------------------ *
 * Wording
 * ------------------------------------------------------------------ */

/**
 * "Full name" -> "full name", but "SKU" stays "SKU".
 *
 * The labels are written in sentence case for a <label>, where they start the
 * line. Dropped mid-sentence they need their capital back off — except for the
 * ones that are acronyms, which a blind lowercase would mangle into "sKU".
 */
function midSentence(label) {
  if (!label) return '';
  if (label.length > 1 && label[1] === label[1].toUpperCase() && /[A-Z]/.test(label[1])) return label;
  return label[0].toLowerCase() + label.slice(1);
}

/** The message for an empty field, in the grammar its control deserves. */
function askFor({ label, input }) {
  const type = (input.type || '').toLowerCase();

  if (type === 'checkbox') return 'Please tick this to continue.';
  if (type === 'radio') return 'Choose one of the options.';

  if (!label) return 'This field is required.';

  return input.tagName === 'SELECT'
    ? `Choose a ${midSentence(label)}.`
    : `Enter your ${midSentence(label)}.`;
}

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

const RULES = {
  required: (v, c) => v.trim().length > 0 || askFor(c),
  email:    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email address.',
  phone:    (v) => !v || /^(\+?880|0)1[3-9]\d{8}$/.test(v.replace(/[\s-]/g, '')) || 'Enter a valid Bangladeshi mobile number.',
  numeric:  (v) => !v || /^\d+$/.test(v) || 'Numbers only.',
};

function ruleWithArg(name, arg, v, form, c) {
  const subject = c.label || 'This';

  switch (name) {
    case 'min':   return v.length >= +arg || `${subject} must be at least ${arg} characters.`;
    case 'max':   return v.length <= +arg || `${subject} must be at most ${arg} characters.`;
    case 'match': {
      const other = form.querySelector(arg);
      return (other && v === other.value) || 'Values do not match.';
    }
    default: return true;
  }
}

/* ------------------------------------------------------------------ *
 * Checking
 * ------------------------------------------------------------------ */

let seq = 0;

/**
 * Point the input at its own error text, and say out loud that it is wrong.
 *
 * Without this the failure is a red border and a class name: visible to
 * someone looking at the screen, silent to anyone using a screen reader, who
 * gets moved to a field by validateForm() and told nothing about why. The
 * describedby link is left in place when the field is valid — the span is
 * empty then, so there is nothing to announce, and not thrashing the attribute
 * keeps assistive tech from re-reading the field on every keystroke.
 */
function wireError(input, errEl) {
  if (!errEl) return;

  if (!errEl.id) errEl.id = `${input.id || input.name || 'field'}-error-${++seq}`;

  const described = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  if (!described.includes(errEl.id)) {
    input.setAttribute('aria-describedby', [...described, errEl.id].join(' '));
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

  const ctx = {
    input,
    label: input.getAttribute('data-label') || input.getAttribute('aria-label') || '',
  };

  let error = '';

  for (const token of spec.split('|')) {
    const [name, arg] = token.split(':');
    const result = arg != null
      ? ruleWithArg(name, arg, value, form, ctx)
      : (RULES[name] ? RULES[name](value, ctx) : true);
    if (result !== true) { error = result; break; }
  }

  const field = input.closest('[data-field]') || input.closest('.field-gr');
  const errEl = field?.querySelector('[data-error]');

  if (field) {
    field.classList.toggle('is-invalid', !!error);
    field.classList.toggle('is-valid', !error && value.trim() !== '');
  }

  if (errEl) {
    wireError(input, errEl);
    errEl.textContent = error;
  }

  if (error) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');

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
