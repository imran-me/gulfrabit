/**
 * account-common — shared bits for every account page: a soft auth guard,
 * logout wiring, and a status-badge helper.
 *
 * Guard is "soft": if there's no mock session we drop a demo user in so the area
 * is explorable without forcing login. // TODO: backend — enforce real auth
 * (redirect to /auth/login when no valid JWT).
 */

import * as store from '../../shared/js/core/state.js';
import { siteURL } from '../../shared/js/core/paths.js';
import { toast } from '../../shared/js/components/toast-notifications.js';

export function ensureSession() {
  let user = store.getUser();
  if (!user) {
    user = { id: 'u-demo', name: 'Guest Explorer', email: 'guest@gulfrabit.com', tier: 'standard', addresses: [] };
    store.setUser(user);
  }
  return user;
}

export function wireLogout() {
  document.querySelector('[data-logout]')?.addEventListener('click', (e) => {
    e.preventDefault();
    store.clearUser();
    toast.info('Signed out');
    setTimeout(() => { window.location.href = siteURL('index.html'); }, 700);
  });
}

export function statusBadge(status) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="order-status order-status--${status}">● ${label}</span>`;
}
