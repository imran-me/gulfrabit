/**
 * Auth · module API (mock)
 * Fakes auth against data/users.json. Replace each function with a real call to
 * the /auth endpoints; auth-page.js keeps the same call sites.
 */
import { getMockUsers } from '../../../shared/js/core/data-service.js';

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
