/**
 * theme.js — applies the storefront theme every visitor is meant to see.
 *
 * THE SETTING IS UNIVERSAL. THAT IS THE WHOLE POINT.
 * -------------------------------------------------
 * One theme is published for the shop and everybody gets it. There is no
 * per-visitor preference here and there must never be one: the merchant
 * chooses how their shop looks, the same way they choose its prices.
 *
 * A universal setting needs somewhere central to live, so the SERVER is the
 * only authority. `localStorage` appears below purely as a mirror of the last
 * answer the server gave, so a returning visitor paints the right theme
 * immediately instead of flashing the other one. Nothing writes that mirror
 * except a successful server read — in particular the admin panel does not,
 * because a value written locally by the merchant would show them a shop no
 * visitor is seeing, which is the exact opposite of universal.
 *
 * WITHOUT A BACKEND, THE BUILD IS THE AUTHORITY
 * ---------------------------------------------
 * On a static deployment there is no server to ask. Then the theme baked into
 * the HTML by `tools/assemble.py --theme <name>` is what every visitor gets —
 * still universal, just changed by a rebuild rather than a click. No cache is
 * ever written in that case (nothing succeeds at reading the server), so the
 * baked default stands for everyone, identically.
 *
 * PRIORITY, HIGHEST FIRST
 * -----------------------
 *   1. ?theme= in the URL — a PREVIEW. Never stored beyond the tab, never
 *      published, and it suppresses the server correction so the person
 *      previewing can actually see the thing they came to look at.
 *   2. the server, via GET /api/theme.
 *   3. the mirror of the server's last answer, applied before first paint by
 *      the inline bootstrap in <head>.
 *   4. whatever theme was baked into the HTML at build time.
 *
 * A failure at 2 falls through to 3, and a failure at 3 to 4. The shop must
 * never be unreachable because a decoration endpoint is down.
 */

import { storage, session, KEYS } from '../../shared/js/core/storage.js';

/** The only values that may ever reach the DOM. */
const THEMES = ['classic', 'luxe'];

/** Preview lives in sessionStorage: it dies with the tab, so it cannot be
 *  mistaken later for the published theme, and it cannot leak to a visitor. */
const PREVIEW_KEY = 'theme-preview';

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'luxe' ? 'luxe' : 'classic';
}

/**
 * Put a theme on the page.
 *
 * Classic is the ABSENCE of the attribute, not a value of it — that is what
 * keeps theme-luxe.css inert. It is removed rather than left alone, because a
 * page baked as Luxe that the server says is Classic has to actually change.
 */
export function applyTheme(name) {
  const theme = THEMES.includes(name) ? name : 'classic';
  const root = document.documentElement;
  if (theme === 'luxe') root.setAttribute('data-theme', 'luxe');
  else root.removeAttribute('data-theme');
  if (theme === 'luxe') { armGilding(); armBurst(); }
  return theme;
}

/* ---- The gold burst ----------------------------------------------------
 * A pinch of the theme's dust thrown from any Add to Cart as it is pressed
 * — the one action that matters, marked in the theme's own material. Bound
 * once, on capture, so it survives buttons that pages re-render; skipped
 * entirely for anyone who asked their device for reduced motion, and inert
 * outside Luxe because the check is at click time, not bind time.
 */
const BURST_FROM = '[data-action="add-to-cart"], [data-add-to-cart], [data-buybar-add], [data-bundle-add]';
let burstArmed = false;

function armBurst() {
  if (burstArmed) return;
  burstArmed = true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.addEventListener('click', (e) => {
    if (currentTheme() !== 'luxe') return;
    const btn = e.target.closest ? e.target.closest(BURST_FROM) : null;
    if (!btn || btn.disabled) return;

    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + 4;
    for (let i = 0; i < 7; i++) {
      const m = document.createElement('span');
      m.className = 'lux-burst';
      const size = 2.5 + Math.random() * 3;
      const dx = (Math.random() - 0.5) * 130;
      const dy = -(46 + Math.random() * 80);
      m.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;`
        + `--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;`
        + `animation-duration:${(480 + Math.random() * 360).toFixed(0)}ms;`
        + `animation-delay:${(Math.random() * 90).toFixed(0)}ms`;
      m.addEventListener('animationend', () => m.remove());
      document.body.appendChild(m);
    }
  }, true);
}

/* ---- Heading gilding ---------------------------------------------------
 * Luxe sets display headings half in the logo's teal, half in metallic gold
 * (see theme-luxe.css) — and CSS cannot colour half a heading. The tail is
 * wrapped here: the LAST half of the words, the way saraalsalam.com gilds
 * "A BULK INQUIRY?", because the end of a phrase is where the eye lands. A
 * one-word heading goes entirely gold — teal alone would read as a link.
 *
 * Only the heading's first text node is touched, so the Bangla gloss spans
 * inside checkout's headings pass through untouched. The wrap is idempotent
 * (a heading that already carries its .lux-gilt is left alone), and each
 * heading is watched: pages write titles in after load — "Shop All", a
 * category's name — and replacing textContent destroys the span, so the
 * watcher simply gilds again. Switching back to classic strips nothing:
 * the span only means anything under [data-theme="luxe"].
 */
const GILD = '.section-head__titles > h1, .section-head__titles > h2, '
  + '.plp-head h1, h1.page-head, .express__head';
let gildArmed = false;

function gildOne(h) {
  if (h.querySelector(':scope > .lux-gilt')) return;
  const tn = Array.from(h.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
  if (!tn) return;
  const words = tn.textContent.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;
  const keep = words.length === 1 ? 0 : Math.ceil(words.length / 2);
  const span = document.createElement('span');
  span.className = 'lux-gilt';
  span.textContent = words.slice(keep).join(' ');
  const frag = document.createDocumentFragment();
  if (keep) frag.append(document.createTextNode(words.slice(0, keep).join(' ') + ' '));
  frag.append(span);
  // The heading may carry more after this text node — checkout's Bangla
  // gloss does — and the wrap must not eat the space that separated them.
  if (tn.nextSibling) frag.append(document.createTextNode(' '));
  tn.replaceWith(frag);
}

function armGilding() {
  if (gildArmed) return;
  gildArmed = true;
  const run = () => {
    document.querySelectorAll(GILD).forEach((h) => {
      gildOne(h);
      new MutationObserver(() => gildOne(h)).observe(h, { childList: true });
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}

/** The ?theme= preview, if one is in play for this tab. */
function previewTheme() {
  let name = null;
  try {
    name = new URLSearchParams(location.search).get('theme');
  } catch { /* malformed URL — no preview */ }

  if (THEMES.includes(name)) {
    // Remembered for the tab so the preview survives clicking around the shop,
    // which is most of what previewing a theme means.
    try { session.set(PREVIEW_KEY, name); } catch { /* private mode */ }
    return name;
  }

  const held = (() => { try { return session.get(PREVIEW_KEY, null); } catch { return null; } })();
  return THEMES.includes(held) ? held : null;
}

/**
 * Ask the server, correct the page, refresh the mirror.
 *
 * Called for its effect; its rejection is swallowed. Nothing the page needs
 * awaits it.
 */
export async function syncTheme() {
  const preview = previewTheme();
  if (preview) {
    // Deliberately does NOT touch the mirror. A preview must leave no trace
    // that could later be read as the published theme.
    return applyTheme(preview);
  }

  try {
    const res = await fetch('/api/theme', { headers: { Accept: 'application/json' } });
    if (!res.ok) return currentTheme();

    const body = await res.json();
    const name = body?.data?.theme ?? body?.theme;
    if (!THEMES.includes(name)) return currentTheme();

    // The ONLY write to the mirror in the codebase.
    try { storage.set(KEYS.THEME, name); } catch { /* private mode */ }
    return applyTheme(name);
  } catch {
    return currentTheme();   // offline, or no backend — 3 then 4 stand.
  }
}

syncTheme();
