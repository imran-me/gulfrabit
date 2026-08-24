/**
 * b2b-page.js — industrial catalogue (spec-driven rows), datasheet list, and
 * the RFQ form. Renders the industrial-materials products with tiered pricing
 * and MOQ badges — deliberately denser and more technical than retail cards.
 */
import { getProductsByCategory } from '../catalog/backend/api.js';
import { productURL, siteURL } from '../../shared/js/core/paths.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { validateForm, attachLiveValidation } from '../../shared/js/utils/validate-form.js';
import { toast } from '../../shared/js/components/toast-notifications.js';

init();

async function init() {
  const products = await getProductsByCategory('industrial-raw-materials');
  renderList(products);
  renderDatasheets(products);
  fillProductChoices(products);
  wireRFQ();
}

/**
 * The RFQ's product list, drawn from the same catalogue as the rows above.
 *
 * It has to be a real SKU. SubmitQuoteRequest validates items.*.sku with
 * exists:products,sku, and the admin inbox reads each line back against the
 * product it names.
 */
function fillProductChoices(products) {
  const sel = document.querySelector('[data-rfq-product]');
  if (!sel) return;

  const form = sel.closest('form');

  /* An empty catalogue makes this form unsubmittable, because the endpoint
     will only accept a line against a SKU that exists — so say that, rather
     than leave a buyer filling in six fields for a Submit that can never
     succeed. Happens when the industrial category is switched off, or when
     the catalogue request failed; renderList() above has already put its own
     notice where the rows would be. */
  if (!products.length) {
    sel.innerHTML = '<option value="">Catalogue unavailable</option>';
    sel.disabled = true;
    sel.removeAttribute('data-validate');

    const btn = form?.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    form?.insertAdjacentHTML('beforeend',
      `<p class="caption" style="margin-top:var(--space-3)">We could not load the industrial catalogue just now. `
      + `Please <a href="${siteURL('contact')}">contact us</a> and we will quote by hand.</p>`);
    return;
  }

  sel.insertAdjacentHTML('beforeend', products
    .map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.title)}${p.moq ? ` (MOQ ${p.moq})` : ''}</option>`)
    .join(''));
}

function renderList(products) {
  const host = document.querySelector('[data-b2b-list]');
  if (!products.length) { host.innerHTML = '<p class="text-muted-gr">Catalogue loading is unavailable.</p>'; return; }
  host.innerHTML = products.map(specRow).join('');
}

function specRow(p) {
  const specs = Object.entries(p.specs || {}).slice(0, 4)
    .map(([k, v]) => `<span><b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}</span>`).join('');
  const tiers = (p.priceTiers || [{ min: p.moq || 1, price: p.price }])
    .map((t) => `<tr><td>${t.min.toLocaleString()}+ pcs</td><td>${formatBDT(t.price)}</td></tr>`).join('');
  return `
    <article class="spec-row">
      <a class="spec-row__media" href="${productURL(p)}"><img src="${p.image}" alt="${escapeAttr(p.title)}" loading="lazy"></a>
      <div>
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem">
          <a href="${productURL(p)}"><strong>${escapeHtml(p.title)}</strong></a>
          ${p.moq ? `<span class="badge-gr moq-badge">MOQ ${p.moq}</span>` : ''}
        </div>
        <div class="spec-row__specs">${specs}</div>
        <div class="caption" style="margin-top:.5rem">${escapeHtml(p.brand)} · ${escapeHtml(p.origin)}${p.specs?.Compliance ? ' · ' + escapeHtml(p.specs.Compliance) : ''}</div>
      </div>
      <div>
        <p class="caption" style="margin-bottom:.25rem">Tiered pricing</p>
        <table class="tier-table"><tbody>${tiers}</tbody></table>
      </div>
      <div style="display:flex;flex-direction:column;gap:.5rem">
        <a class="btn-gr btn-primary-gr btn-sm-gr" href="#rfq" data-rfq-pick="${escapeAttr(p.id)}">Request Quote</a>
        ${p.datasheet ? `<a class="btn-gr btn-ghost-gr btn-sm-gr" href="${p.datasheet}" download>Datasheet</a>` : ''}
      </div>
    </article>`;
}

function renderDatasheets(products) {
  const host = document.querySelector('[data-datasheets]');
  const withDocs = products.filter((p) => p.datasheet);
  host.innerHTML = withDocs.map((p) => `
    <div class="datasheet-row">
      <svg class="datasheet-row__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="22" height="22"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      <span style="flex:1">${escapeHtml(p.title)}</span>
      <a class="btn-gr btn-ghost-gr btn-sm-gr" href="${p.datasheet}" download>Download PDF</a>
    </div>`).join('') || '<p class="text-muted-gr">Datasheets available on request.</p>';
}

/**
 * The RFQ, actually sent.
 *
 * This handler used to validate, reset the form, and toast "RFQ received. Our
 * team will respond within 48 hours." There was no network call anywhere in
 * it: the lead was gone the instant the form reset, and the answer to "what
 * does the buyer see when the API is down" was the same as when it is up.
 *
 * None of that was a missing feature. POST /api/b2b/quotes is live, throttled,
 * and deliberately public; QuoteService and the quote_requests tables are
 * migrated; quotes-page.js is a finished admin inbox. The shop owner has been
 * watching a screen the storefront could never fill.
 */
function wireRFQ() {
  const form = document.querySelector('[data-rfq-form]');
  if (!form) return;

  attachLiveValidation(form);

  // "Request Quote" on a catalogue row lands here with that row already
  // chosen, rather than on an empty form the buyer has to match back to
  // whatever they were reading.
  document.querySelectorAll('[data-rfq-pick]').forEach((a) => a.addEventListener('click', () => {
    const sel = form.querySelector('[data-rfq-product]');
    if (sel) sel.value = a.dataset.rfqPick;
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const { valid } = validateForm(form);
    if (!valid) { toast.error('Please complete the required fields.'); return; }

    const btn = form.querySelector('button[type="submit"]');
    const label = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    const restore = () => { if (btn) { btn.disabled = false; btn.innerHTML = label; } };

    const g = (n) => form.querySelector(`[name="${n}"]`)?.value.trim() || '';

    try {
      const res = await fetch('/api/b2b/quotes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: g('company'),
          contact: g('contact'),
          phone: g('phone'),
          email: g('email') || null,
          notes: g('notes') || null,
          // An array from the start, because the server has always taken one.
          // Today's form fills a single line.
          items: [{ sku: g('sku'), qty: Number(g('qty')) }],
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        // The form is deliberately NOT reset. An RFQ that clears itself on a
        // refusal makes the buyer retype every field to correct one of them.
        restore();
        toast.error(body.message || 'That could not be sent. Please check the details and try again.');
        return;
      }

      form.reset();
      form.querySelectorAll('.is-valid').forEach((f) => f.classList.remove('is-valid'));
      restore();

      const ref = body.data?.reference;
      toast.success(ref
        ? `RFQ ${ref} received. Our B2B desk replies within one working day.`
        : 'RFQ received. Our B2B desk replies within one working day.');
    } catch {
      // It never reached the server. Say so, and leave every field where it is.
      restore();
      toast.error('We could not send that - check your connection and try again.');
    }
  });
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
