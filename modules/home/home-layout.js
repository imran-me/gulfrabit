/**
 * home-layout.js — which SHAPE each home-page section is wearing right now.
 *
 * The merchant chooses this in the panel (Appearance → Home layout) and the
 * choice is universal: one arrangement, every visitor, exactly like the theme.
 * There is no per-visitor preference here and there must never be one.
 *
 * HOW IT REACHES THE PAGE
 * -----------------------
 * As one attribute on <html>, already resolved for the viewport in front of
 * you:
 *
 *     <html data-lay="category:loop trust:static premium:march …">
 *
 * so every stylesheet rule is a plain `html[data-lay~="category:loop"]` and
 * never a media query wrapped around a media query. Resolving the device HERE
 * rather than in CSS is what buys that: the alternative is writing every rule
 * twice, once under each breakpoint, and the second copy is the one that rots.
 *
 * The line between "phone" and "computer" is 768px — the same one the trust
 * band has always used, and the one the admin screen names out loud.
 *
 * PRIORITY, HIGHEST FIRST
 * -----------------------
 *   1. the server, via GET /api/home-layout
 *   2. the mirror of the server's last answer, stamped before first paint by
 *      the inline bootstrap in index.html
 *   3. the arrangement the page is authored in — the defaults below
 *
 * A failure at 1 falls through to 2, and a failure at 2 to 3. Every default
 * below is what index.html and home.css already do on their own, so the whole
 * chain failing leaves the home page looking exactly like the repository. That
 * is the property that makes this safe to put on the busiest URL in the shop.
 *
 * WHY THE DEFAULTS ARE DUPLICATED FROM PHP
 * ----------------------------------------
 * Modules\Theme\Models\HomeLayout has the same table. It has to: this site is
 * deployable with no backend at all, and on that deployment there is nothing to
 * ask. The server stays the authority whenever there IS one — it normalises
 * every answer it gives — and this copy is what keeps a static build honest.
 * Change one, change the other; there is a note in both.
 */

const MIRROR_KEY = 'gr:home-layout';
const PHONE = '(max-width: 767.98px)';

/** Keep in step with Modules\Theme\Models\HomeLayout::SECTIONS. */
export const SECTIONS = {
  category:     { styles: ['grid', 'loop'],          desktop: 'grid',   mobile: 'grid' },
  trust:        { styles: ['static', 'loop'],        desktop: 'static', mobile: 'loop' },
  premium:      { styles: ['march', 'rail', 'grid'], desktop: 'march',  mobile: 'march' },
  bestseller:   { styles: ['grid', 'rail', 'march'], desktop: 'grid',   mobile: 'grid' },
  new:          { styles: ['march', 'rail', 'grid'], desktop: 'march',  mobile: 'march' },
  brands:       { styles: ['wall', 'loop'],          desktop: 'wall',   mobile: 'wall' },
  testimonials: { styles: ['slider', 'grid', 'loop'],desktop: 'slider', mobile: 'slider' },
};

/** Anything → a complete, valid arrangement. Mirrors normalise() in PHP. */
export function normalise(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const [key, spec] of Object.entries(SECTIONS)) {
    const given = (src[key] && typeof src[key] === 'object') ? src[key] : {};
    out[key] = {
      desktop: spec.styles.includes(given.desktop) ? given.desktop : spec.desktop,
      mobile: spec.styles.includes(given.mobile) ? given.mobile : spec.mobile,
    };
  }
  return out;
}

/** The arrangement flattened to "what applies at this width". */
function resolve(layout, phone) {
  const out = {};
  for (const key of Object.keys(SECTIONS)) {
    out[key] = phone ? layout[key].mobile : layout[key].desktop;
  }
  return out;
}

function stamp(resolved) {
  document.documentElement.setAttribute(
    'data-lay',
    Object.entries(resolved).map(([k, v]) => `${k}:${v}`).join(' '),
  );
}

/**
 * What shape a section is in, right now.
 *
 * Read back off the attribute rather than from a variable this module keeps,
 * so that the pre-paint bootstrap — which runs before this file is even
 * fetched — and this file can never disagree about what the page is wearing.
 */
export function styleOf(section) {
  const token = (document.documentElement.getAttribute('data-lay') || '')
    .split(' ')
    .find((t) => t.startsWith(`${section}:`));
  const style = token ? token.slice(section.length + 1) : null;
  const spec = SECTIONS[section];
  if (!spec) return null;
  if (style && spec.styles.includes(style)) return style;
  return matchMedia(PHONE).matches ? spec.mobile : spec.desktop;
}

/**
 * Stamp the page, then keep it stamped.
 *
 * `onChange` is called once immediately — with whatever the mirror or the
 * defaults say, so the page can arrange itself without waiting for a request —
 * and again only when the resolved arrangement actually CHANGES: when the
 * server's answer differs from the mirror, or when the window crosses 768px.
 * Callers are therefore free to be dumb and re-apply everything they own; they
 * are not called for nothing.
 */
export function initHomeLayout(onChange) {
  const phone = matchMedia(PHONE);
  let layout = normalise(readMirror());
  let last = '';

  const apply = () => {
    const resolved = resolve(layout, phone.matches);
    const key = JSON.stringify(resolved);
    if (key === last) return;
    last = key;
    stamp(resolved);
    onChange(resolved);
  };

  apply();
  phone.addEventListener('change', apply);

  // The server has the last word, but it is never waited for. If it agrees
  // with the mirror — the common case, every visit after the first — `apply`
  // finds nothing changed and no section is rebuilt for nothing.
  fetch('/api/home-layout', { headers: { Accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      if (!body?.data?.layout) return;
      layout = normalise(body.data.layout);
      writeMirror(layout);
      apply();
    })
    .catch(() => { /* No backend, or offline. The mirror or the defaults stand. */ });
}

function readMirror() {
  try {
    return JSON.parse(localStorage.getItem(MIRROR_KEY) || 'null');
  } catch {
    return null; // Private mode, or a corrupted value. Defaults are fine.
  }
}

/* Written only after a successful server READ, so the mirror can only ever be
   a copy of what the world is seeing. The panel deliberately does not write
   it — see theme-page.js for the bug that rule exists to prevent. */
function writeMirror(layout) {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(layout));
  } catch { /* Storage full or disabled. The page is already correct. */ }
}
