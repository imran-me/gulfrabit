/**
 * newsletter-signup — validates and "submits" the newsletter band.
 * UI-only for now; on success it stores the email locally and thanks the user.
 *
 * Markup:
 *   <form data-newsletter>
 *     <input name="email" data-validate="required|email" ...>
 *     <button type="submit">Subscribe</button>
 *   </form>
 *
 * // TODO: backend — POST to /api/newsletter/subscribe (Laravel).
 */

import { validateForm, attachLiveValidation } from '../utils/validate-form.js';
import { storage } from '../core/storage.js';
import { toast } from './toast-notifications.js';

export function initNewsletter(root = document) {
  root.querySelectorAll('[data-newsletter]').forEach((form) => {
    if (form.dataset.ready) return;
    form.dataset.ready = 'true';
    attachLiveValidation(form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const { valid, values } = validateForm(form);
      if (!valid) return;
      const list = storage.get('newsletter-emails', []);
      if (!list.includes(values.email)) list.push(values.email);
      storage.set('newsletter-emails', list);
      form.reset();
      form.querySelectorAll('.is-valid').forEach((f) => f.classList.remove('is-valid'));
      toast.success('You’re on the list. Welcome to GulfRabit.');
    });
  });
}
