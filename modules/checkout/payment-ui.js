/**
 * payment-ui.js — make the payment options tell the truth.
 *
 * Both checkouts (the four-step page and the express ad-landing) ship four
 * payment radios in their markup: bKash, Nagad, Card, COD. Which of those can
 * actually be PAID depends on which gateways hold credentials on the server —
 * something only /api/payments/methods knows.
 *
 * Three worlds, three behaviours:
 *   - static host (no backend): the endpoint 404s → change nothing. The page
 *     keeps its honest demo behaviour, exactly as before this file existed.
 *   - backend, no gateways configured: hide bKash/Nagad/Card, leaving COD —
 *     an option the customer can select but never complete is a lie in a
 *     radio button.
 *   - backend + configured gateways: show exactly the ones that work. Card
 *     stays hidden until a card aggregator exists (modules/payments/README).
 */

import { paymentMethods, startPayment } from './backend/api.js';

/** Hide the payment options the server cannot honour. */
export async function adaptPaymentOptions(form) {
  const methods = await paymentMethods();
  if (!methods) return;                        // static host — leave the demo be

  // A real backend is answering, so the "demo checkout" disclaimer is no
  // longer true — orders are real even when every gateway is still dormant.
  form.querySelector('[data-payment-demo-note]')?.remove();

  const available = { bkash: !!methods.bkash, nagad: !!methods.nagad, card: false, cod: true };

  form.querySelectorAll('[data-payment]').forEach((radio) => {
    if (available[radio.value]) return;
    const card = radio.closest('.option-card');
    if (card) card.hidden = true;
    radio.disabled = true;
    radio.checked = false;
  });

  // The default selection may have just vanished — a form where nothing is
  // checked submits payment:undefined, which the server rightly refuses.
  if (!form.querySelector('[data-payment]:checked')) {
    const cod = form.querySelector('[data-payment][value="cod"]');
    if (cod) {
      cod.checked = true;
      cod.closest('.option-card')?.classList.add('is-selected');
      cod.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

/**
 * Hand the browser to the gateway for a just-placed order, if that is what
 * the order asked for and the server can arrange it. Returns true when a
 * redirect is happening (the caller must stop — the page is leaving); false
 * means carry on to the confirmation page, order intact, payable on delivery.
 */
export async function maybeRedirectToGateway(order, phone) {
  if (!['bkash', 'nagad'].includes(order?.payment)) return false;

  const url = await startPayment(order.id, phone);
  if (!url) return false;

  window.location.href = url;
  return true;
}
