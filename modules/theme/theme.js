/**
 * theme.js — applies the merchant's chosen storefront theme.
 *
 * WHY THIS IS RUNTIME AND NOT A BUILD FLAG
 * ----------------------------------------
 * The storefront is static HTML written by tools/assemble.py. If the theme
 * lived only in that build, changing it would mean a developer re-running the
 * assembler and redeploying — which is not a switch, it is a release. The
 * merchant flips this in the admin panel, so the choice has to be readable at
 * runtime by every page.
 *
 * THREE SOURCES, IN PRIORITY ORDER
 * --------------------------------
 *   1. the inline bootstrap in <head> (see tools/assemble.py) applies the
 *      LAST KNOWN theme from localStorage before the first paint, so a
 *      returning visitor never sees the other theme flash;
 *   2. this module asks the server what the theme actually is and corrects
 *      the page if the cache was stale;
 *   3. if the server cannot be reached, whatever step 1 applied stands.
 *
 * Step 3 is the important one and it is the same rule the header menu and the
 * home page shelves follow: a fetch that fails leaves the authored page
 * standing. A theme is decoration — the shop must never be unreachable
 * because a preference endpoint is down.
 *
 * ONE PAINT OF THE DEFAULT, ONCE
 * ------------------------------
 * A visitor arriving for the very first time on a shop set to Luxe has no
 * cache, so they get one paint of Classic before this corrects it. That is
 * the honest cost of a static build plus a runtime setting, it happens once
 * per browser, and the alternative — blocking the render on a network call —
 * is worse for every visit after it.
 */

import { storage, KEYS } from '../../shared/js/core/storage.js';

/** The only values that may ever reach the DOM. */
const THEMES = ['classic', 'luxe'];

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'luxe' ? 'luxe' : 'classic';
}

/**
 * Put a theme on the page. Classic is the ABSENCE of the attribute, not a
 * value of it — that is what keeps modules/theme/theme-luxe.css inert and the
 * default rendering identical to a site where this module does not exist.
 */
export function applyTheme(name) {
  const theme = THEMES.includes(name) ? name : 'classic';
  const root = document.documentElement;
  if (theme === 'luxe') root.setAttribute('data-theme', 'luxe');
  else root.removeAttribute('data-theme');
  return theme;
}

export function cacheTheme(name) {
  try { storage.set(KEYS.THEME, THEMES.includes(name) ? name : 'classic'); } catch { /* private mode */ }
}

/**
 * Ask the server, correct the page, refresh the cache.
 *
 * Deliberately does NOT await anything the page needs. It is called for its
 * effect and its rejection is swallowed — see the module comment.
 */
export async function syncTheme() {
  try {
    const res = await fetch('/api/theme', { headers: { Accept: 'application/json' } });
    if (!res.ok) return currentTheme();
    const body = await res.json();
    const name = body?.data?.theme ?? body?.theme;
    if (!THEMES.includes(name)) return currentTheme();
    cacheTheme(name);
    return applyTheme(name);
  } catch {
    return currentTheme();   // offline, or no backend — the cache stands.
  }
}

syncTheme();
