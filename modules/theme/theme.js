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
const THEMES = ['classic', 'luxe', 'trio', 'noor', 'nakshi', 'utsab'];

/** Preview lives in sessionStorage: it dies with the tab, so it cannot be
 *  mistaken later for the published theme, and it cannot leak to a visitor. */
const PREVIEW_KEY = 'theme-preview';

export function currentTheme() {
  // Reads the attribute against the registry, NOT a hardcoded pair — this
  // helper predated Trio and Noor as a luxe/classic binary, and every
  // fire-time gate that trusted it (the glance, the burst) silently treated
  // the new themes as Classic. Found by tapping the glance observer and
  // watching it report th:classic on a page visibly wearing Noor.
  const t = document.documentElement.getAttribute('data-theme');
  return THEMES.includes(t) ? t : 'classic';
}

/**
 * Which stylesheet each theme needs.
 *
 * Pages link only the theme they were BUILT with — see THEME_SHEETS in
 * tools/assemble.py for why they stopped linking all seven. The pre-paint
 * bootstrap covers a returning visitor whose published theme differs from the
 * build. This covers everyone else: a first-ever visit, and a live switch from
 * the admin preview or ?theme=.
 *
 * Classic is absent on purpose. It is the base stylesheet, not a layer.
 */
const THEME_SHEETS = {
  luxe:   ['/modules/theme/theme-luxe.css'],
  trio:   ['/modules/theme/theme-trio.css'],
  noor:   ['/modules/theme/theme-noor.css', '/modules/theme/theme-noor-sky.css'],
  nakshi: ['/modules/theme/theme-nakshi.css', '/modules/theme/theme-nakshi-scene.css'],
  utsab:  ['/modules/theme/theme-utsab.css'],
};

/**
 * Make sure a theme's stylesheet is on the page, and WAIT for it.
 *
 * The wait is the point. Setting data-theme before its sheet has parsed shows
 * the visitor a frame of half-themed page — Classic's layout wearing none of
 * the new theme's colour — which is worse than the brief delay, and it lands
 * on the switch the merchant is watching in the admin preview.
 *
 * Resolves either way after 3 seconds. A theme is decoration; a shop that will
 * not paint because a stylesheet is slow is a worse failure than a shop that
 * paints in the wrong colour.
 */
function ensureSheets(theme) {
  const hrefs = THEME_SHEETS[theme] || [];

  const pending = hrefs
    // href on a link element resolves to an absolute URL, and the build stamps
    // a ?v= hash on the authored ones, so compare on the pathname alone.
    .filter((href) => !document.querySelector(
      `link[rel="stylesheet"][href*="${href.split('/').pop().split('?')[0]}"]`
    ))
    .map((href) => new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.addEventListener('load', resolve, { once: true });
      // A theme that 404s must not hang the switch for ever.
      link.addEventListener('error', resolve, { once: true });
      document.head.append(link);
    }));

  if (!pending.length) return Promise.resolve();

  return Promise.race([
    Promise.all(pending),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
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
  // Classic is the ABSENCE of the attribute, not a value of it — that is
  // what keeps every theme sheet inert on the default.
  if (theme === 'classic') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  if (theme === 'luxe') { armGilding(); armBurst(); armGlance(); }
  // Trio splits headings too — its tail runs cyan-to-lime instead of gold.
  // The burst and the glance stay with the gold themes: they are made of dust.
  if (theme === 'trio') armGilding();
  // Noor is the gold themes' night: everything that moves in Luxe moves
  // here, and shows better — fireflies against dark water.
  if (theme === 'noor') { armGilding(); armBurst(); armGlance(); armNight(); }
  else {
    // Stop the conductor BEFORE the sweep, or a roll already in flight
    // re-populates the sky a moment after it was cleared.
    noorSky.stop();
    document.querySelectorAll('[data-noor-fx]').forEach((n) => n.remove());
  }

  // Nakshi reuses the gilding — its .lux-gilt tail is dyed alta instead of
  // gold, which is one CSS rule against a mechanism that already runs on
  // every page. It does NOT take the burst or the glance: both are made of
  // dust and light, and neither belongs on a piece of cloth.
  if (theme === 'nakshi') { armGilding(); armField(); }
  else {
    // Same ordering rule as above, and it matters more here: a tiger crossing
    // is a 46-second animation, so a roll that lands after the sweep would
    // leave one walking across whatever theme the visitor switched to.
    nakshiScene.stop();
    document.querySelectorAll('[data-nakshi-fx]').forEach((n) => n.remove());
  }

  if (theme === 'utsab') armFestival();
  else stopFestival();
  return theme;
}

/* ---- Scene loaders -----------------------------------------------------
 * A theme's renderer, fetched when the theme is worn and not one byte before.
 *
 * noor-sky.js is 46 KB and drags noor-physics.js behind it; nakshi-scene.js is
 * another 13 KB. Imported at the top of this file, all 70 KB were fetched,
 * parsed and compiled on every page of a shop wearing Trio — for code that
 * could never run. utsab-gl.js was already dodging this with a dynamic import
 * (immediately below, and the reasoning there is the reasoning here); these
 * two now do the same.
 *
 * Arriving late is safe because both are conductors over CSS that already
 * stands on its own: theme-noor paints its night and theme-nakshi its cloth
 * whether or not the renderer ever shows up. A failed import is a still
 * background, not a broken page.
 */
function lazyScene(load, theme, startFn, stopFn) {
  let mod = null;
  let wanted = false;

  return {
    start() {
      wanted = true;

      const go = () => {
        if (mod) {
          if (wanted && currentTheme() === theme) mod[startFn]();
          return;
        }
        load()
          .then((m) => {
            mod = m;
            // The theme can change while the fetch is in flight, and on a slow
            // connection that window is seconds long. Without this check the
            // sky arrives over whatever theme the visitor switched to.
            if (wanted && currentTheme() === theme) m[startFn]();
          })
          .catch(() => { /* the theme's own CSS is already the background */ });
      };

      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
      else go();
    },

    /* Free when the module was never fetched, which is the usual case: every
       applyTheme() on every other theme calls this, and it does nothing. */
    stop() {
      wanted = false;
      mod?.[stopFn]();
    },
  };
}

const noorSky = lazyScene(() => import('./noor-sky.js'), 'noor', 'startNoorSky', 'stopNoorSky');
const nakshiScene = lazyScene(() => import('./nakshi-scene.js'), 'nakshi', 'startNakshiScene', 'stopNakshiScene');

/* ---- The festival ------------------------------------------------------
 * Utsab is a special-occasion theme, so its renderer is the one thing in this
 * file that is NOT imported at the top. utsab-gl.js is a WebGL2 shader
 * system; a static import would put every byte of it on the critical path of
 * a Classic shop that will never show it. Reached by dynamic import(), after
 * the theme is known, and never fetched on any other day.
 *
 * theme-utsab.css ships a finished gradient background on its own, which is
 * what makes that lateness safe: there is no blank page waiting for a canvas,
 * no WebGL2 means no missing design, and reduced motion is simply the theme
 * without its shader.
 */
let festivalMod = null;
let festivalWanted = false;

function armFestival() {
  festivalWanted = true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const go = () => {
    import('./utsab-gl.js')
      .then((m) => {
        festivalMod = m;
        // The theme can change while a network fetch is in flight, and on a
        // slow connection that window is seconds long. Without this check the
        // canvas arrives over whatever theme the visitor switched to.
        if (festivalWanted && currentTheme() === 'utsab') m.startUtsab();
      })
      .catch(() => { /* the gradient in theme-utsab.css is already a background */ });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
}

function stopFestival() {
  festivalWanted = false;
  festivalMod?.stopUtsab();
  document.querySelectorAll('[data-utsab-fx]').forEach((n) => n.remove());
}

/* ---- The field ---------------------------------------------------------
 * Nakshi's counterpart to armNight(). Deliberately far smaller: the whole
 * theme is composition rather than instrumentation, so there is nothing here
 * to inject beyond the conductor itself — no view transition, no lantern, no
 * curtain. The one thing it shares with Noor is that the scene may not exist
 * before the body does.
 */
let fieldArmed = false;

function armField() {
  if (fieldArmed && !document.querySelector('.nakshi-forest')) fieldArmed = false;
  if (fieldArmed) return;
  fieldArmed = true;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // The permanent cloth is composition and stays; only the conductor is
    // withheld. Laid directly rather than through startNakshiScene(), which
    // refuses to run at all under reduced motion — and refusing to run is
    // the correct behaviour for a conductor and the wrong one for a
    // background.
    const lay = () => {
      if (document.querySelector('.nakshi-forest')) return;
      for (const cls of ['nakshi-forest', 'nakshi-river', 'nakshi-tree', 'nakshi-dhaka']) {
        const n = document.createElement('div');
        n.className = cls;
        n.setAttribute('data-nakshi-fx', '');
        n.setAttribute('data-nakshi-scene', '');
        n.setAttribute('aria-hidden', 'true');
        document.body.appendChild(n);
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lay);
    else lay();
    return;
  }

  nakshiScene.start();
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
    if (currentTheme() !== 'luxe' && currentTheme() !== 'noor') return;
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
    await ensureSheets(preview);
    return applyTheme(preview);
  }

  try {
    const res = await fetch('/api/theme', { headers: { Accept: 'application/json' } });
    if (!res.ok) return currentTheme();

    const body = await res.json();
    const name = body?.data?.theme ?? body?.theme;
    if (!THEMES.includes(name)) return currentTheme();

    // The ONLY write to the mirror in the codebase. Written BEFORE the sheet
    // is fetched, on purpose: the mirror is what lets the next navigation
    // paint this theme before anything is requested at all, and it is correct
    // the moment the server says so — not the moment a stylesheet finishes.
    try { storage.set(KEYS.THEME, name); } catch { /* private mode */ }

    // Nothing to fetch when the page already links this theme, which is the
    // normal case: the build baked it, or the pre-paint bootstrap added it.
    await ensureSheets(name);

    return applyTheme(name);
  } catch {
    return currentTheme();   // offline, or no backend — 3 then 4 stand.
  }
}


/* ---- The glance --------------------------------------------------------
 * Touch screens have no hover, so the scroll is the pointer: as a card
 * crosses the middle of the screen it is marked, the mark runs one pass of
 * the ring light (see .lux-glance in theme-luxe.css), and animationend
 * lifts the mark so the next arrival can run it again. Cards are observed
 * as they appear — the shelves hydrate after load, so a body-level watcher
 * adopts new cards, each exactly once. Idle on desktop, absent under
 * reduced motion, and inert outside Luxe because nothing else adds the
 * class.
 */
let glanceArmed = false;

function armGlance() {
  if (glanceArmed) return;
  glanceArmed = true;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Touch screens always glance — the scroll is their only pointer. Under
  // Noor, EVERY pointer glances: on a dark street the windows light when
  // you walk past, however you walk. Checked at fire time, not arm time,
  // so a tab that switches themes behaves like the theme it is wearing.
  const touchOnly = window.matchMedia('(hover: none)');

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      if (!touchOnly.matches && currentTheme() !== 'noor') continue;
      const el = en.target;
      if (el.classList.contains('lux-glance')) continue;
      el.classList.add('lux-glance');
      el.addEventListener('animationend', () => el.classList.remove('lux-glance'), { once: true });
    }
  }, { threshold: 0.6, rootMargin: '-12% 0px -12% 0px' });

  const adopt = (root) => {
    root.querySelectorAll?.('.product-card:not([data-lux-glance]), .category-card:not([data-lux-glance])')
      .forEach((el) => { el.dataset.luxGlance = '1'; io.observe(el); });
  };

  const run = () => {
    adopt(document);
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) adopt(n);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}

/* Boot LAST: applyTheme reaches every arm-function above, and a `let`
   declared after this line would still be uninitialized when it does —
   exactly the bug that once made the glance observer die silently. */


/* ---- The night instruments ---------------------------------------------
 * Three things CSS cannot conjure alone, armed only under Noor and removed
 * by applyTheme the moment the tab wears anything else ([data-noor-fx]).
 *
 * THE CROSSFADE — cross-document view transitions. The opt-in at-rule
 * cannot be scoped by theme in a stylesheet that is always linked, so the
 * rule itself is injected only while Noor is worn: every navigation melts
 * through black instead of cutting. Browsers without the API simply cut,
 * and reduced-motion keeps the cut on purpose.
 *
 * THE EMBER — one streak of gold across the sky every ~27s; each pass
 * lands at a different height, re-rolled when the animation loops.
 *
 * THE LANTERN — desktop only: a pool of gold light that follows the
 * pointer with a lag, and whose loop SLEEPS once the light has caught up.
 * The night answers the hand; it does not chase it.
 */
let nightArmed = false;

function armNight() {
  if (nightArmed) {
    // Re-entering Noor in the same tab: re-place what applyTheme removed.
    if (!document.getElementById('noor-vt')) nightArmed = false;
  }
  if (nightArmed) return;
  nightArmed = true;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const vt = document.createElement('style');
  vt.id = 'noor-vt';
  vt.setAttribute('data-noor-fx', '');
  vt.textContent = reduce ? '' : `
    @view-transition { navigation: auto; }
    ::view-transition-old(root) { animation: noor-vt-out 360ms ease both; }
    ::view-transition-new(root) { animation: noor-vt-in 480ms ease both; }
    @keyframes noor-vt-out { to { opacity: 0; } }
    @keyframes noor-vt-in { from { opacity: 0; } }
  `;
  document.head.appendChild(vt);

  const ready = () => {
    // The vignette is composition, not motion — it stays under reduced
    // motion. Everything after it moves, and doesn't.
    const vig = document.createElement('div');
    vig.className = 'noor-vignette';
    vig.setAttribute('data-noor-fx', '');
    vig.setAttribute('aria-hidden', 'true');
    document.body.appendChild(vig);

    if (reduce) return;

    // The sky: moon, stars, and a random loop of meteors, fireflies and the
    // occasional phoenix. Everything it makes carries [data-noor-fx], so the
    // sweep above takes the whole sky down when the theme changes.
    noorSky.start();

    // The overture: once per session, the night opens. The curtain is
    // animation-driven CSS with pointer-events:none — nothing can strand it
    // over the shop — and the session flag means back-and-forward browsing
    // never replays it. A ritual repeated on every page is a nag.
    try {
      if (!sessionStorage.getItem('noor-overture')) {
        sessionStorage.setItem('noor-overture', '1');
        const veil = document.createElement('div');
        veil.className = 'noor-curtain';
        veil.setAttribute('data-noor-fx', '');
        veil.setAttribute('aria-hidden', 'true');
        const glyph = document.createElement('span');
        glyph.textContent = '\u09A8\u09C2\u09B0';
        veil.appendChild(glyph);
        veil.addEventListener('animationend', (e) => { if (e.target === veil) veil.remove(); });
        document.body.appendChild(veil);
      }
    } catch { /* private mode: no overture, no harm */ }

    // -- 2 · Phases: the sky knows the hour. dawn 4-8, day 8-17 (deep teal
    // still, but the constellation hides), dusk 17-20, night otherwise.
    const h = new Date().getHours();
    const phase = h < 4 ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : h < 20 ? 'dusk' : 'night';
    document.documentElement.setAttribute('data-noor-phase', phase);

    // -- 6 · The clock greets beneath the monogram, by hour, in Bangla.
    const veilEl = document.querySelector('.noor-curtain');
    if (veilEl) {
      const word = phase === 'dawn' ? '\u09B6\u09C1\u09AD \u09B8\u0995\u09BE\u09B2'
        : phase === 'dusk' ? '\u09B6\u09C1\u09AD \u09B8\u09A8\u09CD\u09A7\u09CD\u09AF\u09BE'
        : phase === 'day' ? '\u09B8\u09CD\u09AC\u09BE\u0997\u09A4\u09AE'
        : '\u09B6\u09C1\u09AD \u09B0\u09BE\u09A4\u09CD\u09B0\u09BF';
      const g = document.createElement('small');
      g.textContent = word;
      veilEl.appendChild(g);
    }

    // -- 11 · The ornate ampersand, wherever a title joins two worlds.
    document.querySelectorAll('.section-head__titles > h2, .category-card__title').forEach((el) => {
      if (el.querySelector('.noor-amp')) return;
      for (const tn of [...el.childNodes]) {
        if (tn.nodeType !== 3 || !tn.textContent.includes('&')) continue;
        const frag = document.createDocumentFragment();
        const parts = tn.textContent.split('&');
        parts.forEach((part, i) => {
          frag.append(document.createTextNode(part));
          if (i < parts.length - 1) {
            const amp = document.createElement('span');
            amp.className = 'noor-amp';
            amp.textContent = '&';
            frag.append(amp);
          }
        });
        tn.replaceWith(frag);
      }
    });

    // -- 29 · The coin: the cart badge flips when its number changes.
    document.querySelectorAll('[data-cart-count], [data-tabbar-count]').forEach((badge) => {
      new MutationObserver(() => {
        badge.classList.remove('noor-coin');
        void badge.offsetWidth;               // restart the animation
        badge.classList.add('noor-coin');
      }).observe(badge, { childList: true, characterData: true, subtree: true });
    });

    // -- 4 · The petal: rarer than the ember, a saffron fleck drifts down.
    const petal = document.createElement('div');
    petal.className = 'noor-petal';
    petal.setAttribute('data-noor-fx', '');
    petal.setAttribute('aria-hidden', 'true');
    const rollP = () => petal.style.setProperty('--petal-x', (10 + Math.random() * 80).toFixed(1) + 'vw');
    rollP();
    petal.addEventListener('animationiteration', rollP);
    document.body.appendChild(petal);

    // -- 39 · The dhow: a sail crosses the shore, far below, now and then.
    const footer = document.querySelector('footer');
    if (footer) {
      const dhow = document.createElement('div');
      dhow.className = 'noor-dhow';
      dhow.setAttribute('data-noor-fx', '');
      dhow.setAttribute('aria-hidden', 'true');
      footer.style.position = 'relative';
      footer.style.overflow = 'hidden';
      footer.appendChild(dhow);

      // -- 49 · The gathering: reaching the shore, the waterline flares.
      new IntersectionObserver((es) => {
        for (const en of es) {
          if (!en.isIntersecting) continue;
          footer.classList.add('noor-shore-lit');
          setTimeout(() => footer.classList.remove('noor-shore-lit'), 2600);
        }
      }, { threshold: 0.25 }).observe(footer);
    }

    // -- 23 · The origin seal on the product page's brand line.
    const brand = document.querySelector('[data-pdp-brand]');
    if (brand && !brand.querySelector('.noor-seal')) {
      const seal = () => {
        const txt = brand.textContent;
        const dot = txt.lastIndexOf('\u00b7');
        if (dot === -1) return;
        brand.textContent = txt.slice(0, dot).trim();
        const chip = document.createElement('span');
        chip.className = 'noor-seal';
        chip.textContent = txt.slice(dot + 1).trim();
        brand.appendChild(chip);
      };
      if (brand.textContent.includes('\u00b7')) seal();
      else new MutationObserver((m, o) => {
        if (brand.textContent.includes('\u00b7') && !brand.querySelector('.noor-seal')) { seal(); o.disconnect(); }
      }).observe(brand, { childList: true, characterData: true, subtree: true });
    }

    const ember = document.createElement('div');
    ember.className = 'noor-ember';
    ember.setAttribute('data-noor-fx', '');
    ember.setAttribute('aria-hidden', 'true');
    const roll = () => ember.style.setProperty('--ember-y', (4 + Math.random() * 26).toFixed(1) + 'vh');
    roll();
    ember.addEventListener('animationiteration', roll);
    document.body.appendChild(ember);

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const lamp = document.createElement('div');
      lamp.className = 'noor-lantern';
      lamp.setAttribute('data-noor-fx', '');
      lamp.setAttribute('aria-hidden', 'true');
      document.body.appendChild(lamp);

      let tx = -400, ty = -400, x = tx, y = ty, raf = 0;
      const step = () => {
        x += (tx - x) * 0.09;
        y += (ty - y) * 0.09;
        lamp.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        if (Math.abs(tx - x) + Math.abs(ty - y) > 0.6) raf = requestAnimationFrame(step);
        else raf = 0;                      // caught up — the loop sleeps
      };
      window.addEventListener('pointermove', (e) => {
        tx = e.clientX; ty = e.clientY;
        if (!raf && document.documentElement.getAttribute('data-theme') === 'noor') {
          raf = requestAnimationFrame(step);
        }
      }, { passive: true });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
}

/* Boot LAST — see the note above. */
syncTheme();
