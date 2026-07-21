/**
 * b2b-page.js — industrial catalogue (spec-driven rows), datasheet list, and
 * the RFQ form. Renders the industrial-materials products with tiered pricing
 * and MOQ badges — deliberately denser and more technical than retail cards.
 */
import { getProductsByCategory } from '../../shared/js/core/data-service.js';
import { formatBDT } from '../../shared/js/utils/format-currency.js';
import { validateForm, attachLiveValidation } from '../../shared/js/utils/validate-form.js';
import { toast } from '../../shared/js/components/toast-notifications.js';

init();

async function init() {
  const products = await getProductsByCategory('industrial-raw-materials');
  renderList(products);
  renderDatasheets(products);
  wireRFQ();
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
      <a class="spec-row__media" href="/modules/catalog/product.html?id=${p.id}"><img src="${p.image}" alt="${escapeAttr(p.title)}" loading="lazy"></a>
      <div>
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem">
          <a href="/modules/catalog/product.html?id=${p.id}"><strong>${escapeHtml(p.title)}</strong></a>
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
        <a class="btn-gr btn-primary-gr btn-sm-gr" href="#rfq">Request Quote</a>
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

function wireRFQ() {
  const form = document.querySelector('[data-rfq-form]');
  if (!form) return;
  attachLiveValidation(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { valid } = validateForm(form);
    if (!valid) { toast.error('Please complete the required fields.'); return; }
    // TODO: backend — POST /b2b/rfq (see modules/b2b/backend/endpoints.md).
    form.reset();
    form.querySelectorAll('.is-valid').forEach((f) => f.classList.remove('is-valid'));
    toast.success('RFQ received. Our team will respond within 48 hours.');
  });
}

function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function escapeAttr(str = '') { return String(str).replace(/"/g, '&quot;'); }
