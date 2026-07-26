/**
 * Auth · module API (mock)
 * Fakes auth against this module's data/users.json. Replace each function with a real call to
 * the /auth endpoints; auth-page.js keeps the same call sites.
 */
import { loadJSON } from '../../../shared/js/core/json-cache.js';
import { siteURL } from '../../../shared/js/core/paths.js';

// Auth owns the user fixtures. Moved out of the global /data bucket 2026-07-26.
const USERS_URL = siteURL('modules/auth/data/users.json');

/** Mock user directory. Replaced wholesale by the auth endpoints. */
export async function getMockUsers() {
  const { users } = await loadJSON(USERS_URL);
  return users;
}

export async function login(email, password) {
  // TODO: backend — POST /auth/login, store JWT (httpOnly cookie preferred).
  const users = await getMockUsers();
  const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
  return u ? { user: sanitize(u), token: 'mock.jwt.token' } : null;
}

export async function register(payload) {
  // TODO: backend — POST /auth/register (server hashes the password).
  return { user: { id: 'u-new', ...payload, tier: 'standard', addresses: [] }, token: 'mock.jwt.token' };
}

export async function forgotPassword(/* email */) {
  // TODO: backend — POST /auth/forgot-password.
  return true;
}

function sanitize(u) { const { password, ...safe } = u; return safe; }
