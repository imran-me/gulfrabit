/**
 * contact-page.js — validates and "sends" the contact form (UI-only).
 * // TODO: backend — POST /contact (Laravel) with server-side validation + spam guard.
 */
import { validateForm, attachLiveValidation } from '../../shared/js/utils/validate-form.js';
import { toast } from '../../shared/js/components/toast-notifications.js';
import { track } from '../../shared/js/core/analytics.js';

const form = document.querySelector('[data-contact-form]');
if (form) {
  attachLiveValidation(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { valid } = validateForm(form);
    if (!valid) { toast.error('Please complete the required fields.'); return; }
    form.reset();
    form.querySelectorAll('.is-valid').forEach((f) => f.classList.remove('is-valid'));
    // Meta's standard event for "a customer got in touch". Fired on the same
    // signal the toast is, because there is no backend yet (see the TODO
    // above) and a passed validation is the strongest thing this page knows.
    // When POST /contact lands, move this below the response — otherwise a
    // send that failed server-side still counts as a lead.
    track('Contact');
    toast.success('Message sent — we’ll be in touch shortly.');
  });
}
