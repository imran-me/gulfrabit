/**
 * auth-page.js — one module for login / register / forgot (mode via
 * data-auth-mode). Real client-side validation; mock success flows.
 *
 * MOCK ONLY — auth is faked against data/users.json + localStorage session.
 * // TODO: backend — replace with JWT auth (see modules/auth/backend/endpoints.md).
 */

import { getMockUsers } from '../../shared/js/core/data-service.js';
import * as store from '../../shared/js/core/state.js';
import { siteURL } from '../../shared/js/core/paths.js';
import { validateForm, attachLiveValidation } from '../../shared/js/utils/validate-form.js';
import { toast } from '../../shared/js/components/toast-notifications.js';

const form = document.querySelector('[data-auth-form]');
if (form) init();

function init() {
  attachLiveValidation(form);
  // Password visibility toggles.
  form.querySelectorAll('[data-toggle-pw]').forEach((btn) => btn.addEventListener('click', () => {
    const input = btn.closest('.pw-toggle').querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));

  const mode = form.dataset.authMode;
  form.addEventListener('submit', (e) => { e.preventDefault(); handlers[mode]?.(); });
}

const handlers = {
  async login() {
    const { valid, values } = validateForm(form);
    if (!valid) return;
    const users = await getMockUsers();
    const user = users.find((u) => u.email.toLowerCase() === values.email.toLowerCase() && u.password === values.password);
    if (!user) { toast.error('Incorrect email or password.'); return; }
    signIn(user);
  },

  async register() {
    const { valid, values } = validateForm(form);
    if (!valid) { if (!form.querySelector('[name="terms"]').checked) toast.error('Please accept the terms.'); return; }
    // Mock: accept any new account (no server to persist to).
    signIn({ id: 'u-new', name: values.name, email: values.email, phone: values.phone, tier: 'standard', addresses: [] });
  },

  forgot() {
    const { valid } = validateForm(form);
    if (!valid) return;
    toast.success('If that email exists, a reset link is on its way.');
    setTimeout(() => { window.location.href = siteURL('modules/auth/login.html'); }, 1600);
  },
};

function signIn(user) {
  store.setUser({ id: user.id, name: user.name, email: user.email, phone: user.phone, tier: user.tier, addresses: user.addresses || [] });
  toast.success(`Welcome, ${user.name.split(' ')[0]}.`);
  setTimeout(() => { window.location.href = siteURL('modules/account/dashboard.html'); }, 900);
}
