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

/**
 * Ask for a login code.
 *
 * Always resolves the same way whether or not an account exists — mirroring the
 * server, which never confirms that a number shops here.
 *
 * @returns {Promise<{sent:boolean, expiresInMinutes:number}>}
 */
export async function requestOtp(/* phone */) {
  // TODO: backend — POST /api/auth/otp/request
  return { sent: true, expiresInMinutes: 10 };
}

/**
 * Verify a code. Signs in, and creates the account if the number is new —
 * someone who has just proved they control the number should not then be asked
 * to sign up.
 *
 * The mock accepts any 6 digits so the flow can be built before a gateway
 * exists. The real endpoint checks a hashed, single-use, 10-minute code.
 *
 * @returns {Promise<{user:object, token:string}|null>}
 */
export async function verifyOtp(phone, code) {
  // TODO: backend — POST /api/auth/otp/verify
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const users = await getMockUsers();
  const existing = users.find((u) => (u.phone || '').endsWith(String(phone).slice(-10)));
  return {
    user: existing ? sanitize(existing) : { id: 'u-new', name: 'GulfRabit customer', phone, tier: 'standard' },
    token: 'mock.sanctum.token',
  };
}

export async function forgotPassword(/* email */) {
  // TODO: backend — POST /auth/forgot-password.
  return true;
}

function sanitize(u) { const { password, ...safe } = u; return safe; }
