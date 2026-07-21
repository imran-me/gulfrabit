/**
 * contact-page.js — validates and "sends" the contact form (UI-only).
 * // TODO: backend — POST /contact (Laravel) with server-side validation + spam guard.
 */
import { validateForm, attachLiveValidation } from '../../shared/js/utils/validate-form.js';
import { toast } from '../../shared/js/components/toast-notifications.js';

const form = document.querySelector('[data-contact-form]');
if (form) {
  attachLiveValidation(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { valid } = validateForm(form);
    if (!valid) { toast.error('Please complete the required fields.'); return; }
    form.reset();
    form.querySelectorAll('.is-valid').forEach((f) => f.classList.remove('is-valid'));
    toast.success('Message sent — we’ll be in touch shortly.');
  });
}
