/**
 * notify-me.js — "tell me when I can buy this".
 *
 * Loaded on demand, never in the main bundle. Most cards in a grid are
 * ordinary in-stock products and should not be paying for this file.
 *
 * ONE ASK, ONE FIELD
 * ------------------
 * A phone number and nothing else. Every extra field on a form like this costs
 * a share of the people who would have filled it in, and there is nothing else
 * worth knowing — the product is known from the card, and the phone number is
 * how this shop reaches anybody. It is remembered locally afterwards, so the
 * second product somebody asks about is one tap.
 */

import { toast } from '/shared/js/components/toast-notifications.js';

const KEY = 'gr:notify-phone';

/**
 * Ask for a number and register the interest.
 *
 * @param {{id:string,title:string}} product  as carried on the card
 */
export async function askToNotify(product) {
  const remembered = read(KEY);

  const phone = await prompt(product.title, remembered);
  if (phone === null) return;                    // dismissed; nothing happens

  if (phone.replace(/\D+/g, '').length < 6) {
    toast.error('That does not look like a phone number.');
    return;
  }

  let payload;
  try {
    const res = await fetch('/api/catalog/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sku: product.id, phone }),
    });
    payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 409 is the good failure: it landed while the page was open. Said as
      // news rather than as an error, because it is what the customer wanted.
      toast[res.status === 409 ? 'success' : 'error'](
        payload.message || 'Could not save that just now.',
      );
      return;
    }
  } catch {
    toast.error('Could not reach the shop. Check your connection and try again.');
    return;
  }

  // Only remembered once the server has accepted it, so a typo that was
  // rejected is not offered back as the default next time.
  try { localStorage.setItem(KEY, phone); } catch { /* private window */ }

  toast.success(payload.message || 'We will text you.');
}

/**
 * A one-field dialog, native so Escape, focus trapping and the backdrop are
 * the browser's problem rather than four more things to get subtly wrong.
 *
 * Resolves the typed number, or null if it was dismissed.
 *
 * @returns {Promise<string|null>}
 */
function prompt(title, remembered) {
  const dlg = document.createElement('dialog');
  dlg.className = 'notify';
  dlg.innerHTML = `
    <form method="dialog" class="notify__panel">
      <h2 class="notify__title">Tell me when it is ready</h2>
      <p class="notify__sub"></p>
      <label class="notify__label" for="notify-phone">Your mobile number</label>
      <input class="input-gr" id="notify-phone" name="phone" type="tel"
             inputmode="tel" autocomplete="tel" maxlength="24"
             placeholder="01XXXXXXXXX" required>
      <p class="notify__fine">One message, when it lands. Nothing else, ever.</p>
      <div class="notify__actions">
        <button type="submit" value="cancel" class="btn-gr btn-ghost-gr">Not now</button>
        <button type="submit" value="ok" class="btn-gr btn-primary-gr">Tell me</button>
      </div>
    </form>`;

  // textContent for the product name: it is shop data, and building it into
  // the innerHTML above would put an apostrophe in a title through the parser.
  dlg.querySelector('.notify__sub').textContent = title;

  const input = dlg.querySelector('#notify-phone');
  if (remembered) input.value = remembered;

  document.body.append(dlg);

  return new Promise((resolve) => {
    dlg.addEventListener('close', () => {
      const value = dlg.returnValue === 'ok' ? input.value.trim() : null;
      dlg.remove();
      resolve(value);
    }, { once: true });

    dlg.showModal();
    input.focus();
    input.select();
  });
}

function read(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
