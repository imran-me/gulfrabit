/**
 * card-parts.js — which parts of a product card this shop shows.
 *
 * Same shape as modules/home/home-layout.js, and for the same reasons; read
 * that file for the long version. Two things differ, both because a product
 * card is not a home-page section:
 *
 *   IT IS ON EVERY PAGE. So it is stamped by the pre-paint bootstrap that
 *   every page carries (tools/assemble.py) rather than one page's, and it is
 *   fetched by theme.js — which every storefront page already loads — instead
 *   of asking for a second thing on every page in the shop.
 *
 *   THE ANSWER IS A BOOLEAN, so the attribute lists only what is switched OFF:
 *
 *       <html data-card="wishlist:off quickview:off">
 *
 *   Absence therefore means "shown", which is the shipped card, which is what
 *   every page renders with no JavaScript and no backend. There is no state in
 *   which a part vanishes because something failed.
 */

const MIRROR_KEY = 'gr:card';
const PHONE = '(max-width: 767.98px)';

/** Keep in step with Modules\Theme\Models\CardParts::PARTS. */
export const PARTS = ['wishlist', 'quickview', 'discount', 'tags', 'brand', 'rating', 'saving'];

/** Anything → a complete, valid answer. Mirrors normalise() in PHP. */
export function normalise(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const part of PARTS) {
    const given = (src[part] && typeof src[part] === 'object') ? src[part] : {};
    out[part] = {
      desktop: typeof given.desktop === 'boolean' ? given.desktop : true,
      mobile: typeof given.mobile === 'boolean' ? given.mobile : true,
    };
  }
  return out;
}

/** The tokens for what is hidden at this width, as the attribute wants them. */
export function tokens(card, phone = matchMedia(PHONE).matches) {
  return PARTS
    .filter((part) => !(phone ? card[part].mobile : card[part].desktop))
    .map((part) => `${part}:off`)
    .join(' ');
}

/**
 * ?card=wishlist:off+quickview:off — a PREVIEW, straight from the panel.
 *
 * Already resolved for the width it was built at, never stored, and it wins
 * over the server so the person previewing sees what they came to look at.
 * Every token is checked against the vocabulary because this comes from a URL
 * and lands in an HTML attribute.
 */
export function readPreview() {
  const raw = new URLSearchParams(location.search).get('card');
  if (raw === null) return null;
  const kept = raw.trim().split(/\s+/)
    .filter((t) => PARTS.includes(t.slice(0, -4)) && t.endsWith(':off'));
  // An empty ?card= is a real answer: "preview the whole card".
  return kept.join(' ');
}

export function stamp(card) {
  const value = tokens(card);
  const root = document.documentElement;
  // Removed rather than left empty: `[data-card]` with nothing in it is a
  // shop with every part shown, and so is no attribute at all. One of those
  // two states is enough.
  if (value) root.setAttribute('data-card', value);
  else root.removeAttribute('data-card');
}

/** Is this part on the card right now? */
export function shows(part) {
  return !(document.documentElement.getAttribute('data-card') || '')
    .split(' ')
    .includes(`${part}:off`);
}

export function readMirror() {
  try {
    return JSON.parse(localStorage.getItem(MIRROR_KEY) || 'null');
  } catch {
    return null;
  }
}

/* Written only after a successful server READ, so the mirror can only ever be
   a copy of what the world is seeing. The panel deliberately does not write it
   — see theme-page.js for the bug that rule exists to prevent. */
export function writeMirror(card) {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(card));
  } catch { /* private mode, or storage full. The page is already correct. */ }
}

/**
 * Apply an answer, and keep applying it across the 768px line.
 *
 * Called once by theme.js with the server's answer. The pre-paint bootstrap has
 * already stamped the mirror's, so this is usually a no-op that only earns its
 * keep on the first visit after a change — and on a window dragged across the
 * breakpoint, which is what the listener is for.
 */
export function applyCardParts(card) {
  /* A preview is already resolved for one width, so it is stamped once and
     left alone — and nothing is mirrored, or the preview would follow the
     merchant around the shop showing them a card no visitor is seeing. */
  const preview = readPreview();
  if (preview !== null) {
    const root = document.documentElement;
    if (preview) root.setAttribute('data-card', preview);
    else root.removeAttribute('data-card');
    return;
  }

  stamp(card);
  matchMedia(PHONE).addEventListener('change', () => stamp(card));
}
