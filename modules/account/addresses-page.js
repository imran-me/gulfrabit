/**
 * addresses-page.js — localStorage-backed address CRUD.
 * Seeds from the mock user's addresses on first visit; thereafter edits persist.
 */
import * as store from '../../shared/js/core/state.js';
import { storage, KEYS } from '../../shared/js/core/storage.js';
import { validateForm, attachLiveValidation } from '../../shared/js/utils/validate-form.js';
import { toast } from '../../shared/js/components/toast-notifications.js';
import { ensureSession, wireLogout } from './account-common.js';

const user = ensureSession();
wireLogout();

const grid = document.querySelector('[data-address-grid]');
const emptyEl = document.querySelector('[data-address-empty]');
const dialog = document.querySelector('[data-address-dialog]');
const form = document.querySelector('[data-address-form]');

// Seed from user's addresses once.
let addresses = storage.get(KEYS.ADDRESSES, null);
if (addresses == null) { addresses = user.addresses || []; storage.set(KEYS.ADDRESSES, addresses); }

attachLiveValidation(form);
document.querySelectorAll('[data-add-address],[data-add-address-2]').forEach((b) => b.addEventListener('click', () => openDialog()));
document.querySelector('[data-address-cancel]').addEventListener('click', closeDialog);
document.querySelector('[data-address-backdrop]').addEventListener('click', closeDialog);
form.addEventListener('submit', save);
render();

function render() {
  if (!addresses.length) { grid.innerHTML = ''; emptyEl.hidden = false; return; }
  emptyEl.hidden = true;
  grid.innerHTML = addresses.map((a) => `
    <div class="surface-gr address-card ${a.isDefault ? 'is-default' : ''}">
      ${a.isDefault ? '<span class="badge-gr badge-new" style="position:absolute;top:1rem;right:1rem">Default</span>' : ''}
      <strong>${escapeHtml(a.label)}</strong>
      <p class="text-muted-gr" style="margin:.5rem 0">${escapeHtml(a.line1)}<br>${escapeHtml(a.city)} ${escapeHtml(a.postcode || '')}<br>${escapeHtml(a.country || 'Bangladesh')}</p>
      <div style="display:flex;gap:.5rem;margin-top:1rem">
        <button class="btn-gr btn-outline-gr btn-sm-gr" data-edit="${a.id}">Edit</button>
        ${a.isDefault ? '' : `<button class="btn-gr btn-ghost-gr btn-sm-gr" data-default="${a.id}">Set default</button>`}
        <button class="btn-gr btn-ghost-gr btn-sm-gr" data-delete="${a.id}" style="color:var(--gr-gray-500)">Delete</button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openDialog(find(b.dataset.edit))));
  grid.querySelectorAll('[data-default]').forEach((b) => b.addEventListener('click', () => setDefault(b.dataset.default)));
  grid.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => remove(b.dataset.delete)));
}

function openDialog(addr = null) {
  form.reset();
  form.querySelector('[name="id"]').value = addr?.id || '';
  document.querySelector('[data-dialog-title]').textContent = addr ? 'Edit address' : 'Add address';
  if (addr) { form.label.value = addr.label; form.line1.value = addr.line1; form.city.value = addr.city; form.postcode.value = addr.postcode || ''; form.isDefault.checked = !!addr.isDefault; }
  dialog.hidden = false;
  document.body.style.overflow = 'hidden';
  form.label.focus();
}
function closeDialog() { dialog.hidden = true; document.body.style.overflow = ''; }

function save(e) {
  e.preventDefault();
  const { valid, values } = validateForm(form);
  if (!valid) return;
  const id = values.id || `a-${Date.now().toString(36)}`;
  const record = { id, label: values.label, line1: values.line1, city: values.city, postcode: values.postcode || '', country: 'Bangladesh', isDefault: form.isDefault.checked };
  const idx = addresses.findIndex((a) => a.id === id);
  if (idx >= 0) addresses[idx] = record; else addresses.push(record);
  if (record.isDefault) addresses.forEach((a) => { a.isDefault = a.id === id; });
  persist(); closeDialog(); toast.success('Address saved');
}

function setDefault(id) { addresses.forEach((a) => { a.isDefault = a.id === id; }); persist(); }
function remove(id) { addresses = addresses.filter((a) => a.id !== id); persist(); toast.info('Address removed'); }
function persist() { storage.set(KEYS.ADDRESSES, addresses); store.setUser({ ...store.getUser(), addresses }); render(); }

function find(id) { return addresses.find((a) => a.id === id); }
function escapeHtml(str = '') { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
