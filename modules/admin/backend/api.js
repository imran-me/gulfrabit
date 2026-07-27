/**
 * admin/backend/api.js — the frontend seam for the admin panel.
 *
 * THE MOCK MUST NEVER BECOME AN AUTH BYPASS
 * -----------------------------------------
 * The rest of this project mocks its backend freely, because the worst a fake
 * product list can do is show the wrong price. A fake *session* is different:
 * get this wrong and the mock hands out admin access on a real deployment.
 *
 * So the fallback is gated on ONE condition — the endpoint is not there at all
 * (network failure, or a 404 because no PHP is running). If the server answers
 * 401 or 403, that is the real backend saying no, and the mock stays out of it.
 * A mock that steps in on 401 is an authentication bypass with a friendly name.
 *
 * The fixture is also refused outright on a non-local origin, so that even a
 * mistaken deployment of these files cannot serve a fake session to the public
 * internet. Both guards are belt and braces; either alone would be enough, and
 * that is the point.
 */

const API = '/api/admin';
const DEV_KEY = 'gr:admin-dev-session';

/** Local development only. Anything else and the fixture refuses to run. */
function isLocalOrigin() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '' || h.endsWith('.local');
}

/**
 * True only when there is no backend at all.
 *
 * A TypeError from fetch means the request never completed — no server, or no
 * network. A 404 means something answered but the route does not exist, which
 * is what a static file server does with /api/*. Neither is a decision about
 * this user; both mean "PHP is not running here".
 */
function isBackendAbsent(errOrResponse) {
  if (errOrResponse instanceof TypeError) return true;

  // 404: something answered, but the route does not exist — what a static file
  //      server does with GET /api/*.
  // 501: the server does not implement the method at all, which is what a
  //      static server says to POST. A Laravel app never returns 501 for a
  //      route it serves.
  //
  // 405 is deliberately NOT on this list. Laravel returns it when a route
  // exists but the method is wrong, so accepting it would let a real backend's
  // routing mistake be mistaken for "no backend" — and that is the exact door
  // this function exists to keep shut.
  return errOrResponse?.status === 404 || errOrResponse?.status === 501;
}

/** The one dev identity the fixture will issue, and only locally. */
const DEV_SESSION = {
  id: 0,
  name: 'Local Dev (fixture)',
  email: 'dev@localhost',
  role: 'owner',
  capabilities: ['dashboard', 'orders', 'customers', 'products', 'inventory', 'accounting', 'content', 'staff', 'settings'],
  isFixture: true,
};

/**
 * The signed-in staff member, or null.
 * @returns {Promise<null|{id:number,name:string,email:string,role:string,capabilities:string[]}>}
 */
export async function getSession() {
  try {
    const res = await fetch(`${API}/me`, { credentials: 'same-origin' });

    if (res.ok) return (await res.json()).data;

    // The server answered and said no. That is an answer, not an absence.
    if (res.status === 401 || res.status === 403) return null;

    if (isBackendAbsent(res)) return devSession();

    return null;
  } catch (err) {
    if (isBackendAbsent(err)) return devSession();
    throw err;
  }
}

function devSession() {
  if (!isLocalOrigin()) {
    console.error('[admin] No backend, and this is not a local origin. Refusing to fake a session.');
    return null;
  }
  if (localStorage.getItem(DEV_KEY) !== 'on') return null;

  console.warn(
    '[admin] FIXTURE SESSION — no PHP backend is running, so this panel is ' +
    'showing a local development identity with no authentication whatsoever. ' +
    'Nothing here is secured. Clear it with localStorage.removeItem("%s").',
    DEV_KEY,
  );
  return { ...DEV_SESSION };
}

/**
 * Sign in.
 * @returns {Promise<{ok:true,user:object}|{ok:false,message:string}>}
 */
export async function signIn(email, password) {
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) return { ok: true, user: (await res.json()).data };

    if (isBackendAbsent(res)) return devSignIn();

    const body = await res.json().catch(() => ({}));
    return { ok: false, message: body.message || 'Sign-in failed.' };
  } catch (err) {
    if (isBackendAbsent(err)) return devSignIn();
    return { ok: false, message: 'Could not reach the server.' };
  }
}

/**
 * The fixture sign-in. Takes no credentials on purpose: pretending to check a
 * password teaches everyone that the check is real. It is explicitly a switch
 * labelled "there is no backend yet", and it only flips locally.
 */
function devSignIn() {
  if (!isLocalOrigin()) {
    return { ok: false, message: 'No backend available, and fixtures are local-only.' };
  }
  localStorage.setItem(DEV_KEY, 'on');
  return { ok: true, user: { ...DEV_SESSION }, fixture: true };
}

export async function signOut() {
  localStorage.removeItem(DEV_KEY);
  try {
    await fetch(`${API}/logout`, { method: 'POST', credentials: 'same-origin' });
  } catch {
    /* Signing out locally is what matters; a failed round-trip must not trap
       someone in a session they asked to leave. */
  }
}

/**
 * Fetch wrapper for admin screens.
 *
 * Centralises the two responses every screen handles identically: 401 means the
 * session went away, so go to the login page; 403 means the role is wrong, and
 * the screen should say so rather than render an empty table that looks broken.
 *
 * @throws {Error & {status:number}} on any non-ok response
 */
export async function adminFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (res.status === 401) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(`/modules/admin/login.html?next=${next}`);
    throw Object.assign(new Error('Session expired'), { status: 401 });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.message || `Request failed (${res.status})`), {
      status: res.status,
    });
  }

  return res.json();
}
