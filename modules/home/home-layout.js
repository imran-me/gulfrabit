/**
 * home-layout.js — which SHAPE each home-page section is wearing right now.
 *
 * The merchant chooses this in the panel (Appearance → Home layout) and the
 * choice is universal: one arrangement, every visitor, exactly like the theme.
 * There is no per-visitor preference here and there must never be one.
 *
 * HOW IT REACHES THE PAGE
 * -----------------------
 * There are two halves to it: the SHAPE each section wears, and the ORDER the
 * sections come in. They arrive together, from one record and one request.
 *
 * The shape reaches the page as one attribute on <html>, already resolved for
 * the viewport in front of you:
 *
 *     <html data-lay="category:loop trust:static premium:march …">
 *
 * so every stylesheet rule is a plain `html[data-lay~="category:loop"]` and
 * never a media query wrapped around a media query. Resolving the device HERE
 * rather than in CSS is what buys that: the alternative is writing every rule
 * twice, once under each breakpoint, and the second copy is the one that rots.
 *
 * The order reaches the page as the page itself: the sections are moved. Not
 * flex `order`, which would have been one line of CSS — a screen reader and
 * the Tab key follow the DOM, so a page reordered that way READS in an order
 * nobody chose while it LOOKS like the order somebody did. On the busiest URL
 * in the shop that is not a trade worth making for a saved line.
 *
 * The line between "phone" and "computer" is 768px — the same one the trust
 * band has always used, and the one the admin screen names out loud.
 *
 * PRIORITY, HIGHEST FIRST
 * -----------------------
 *   1. ?lay= and ?ord= in the URL — a PREVIEW. Never stored, never published,
 *      and it
 *      suppresses the server read entirely so the person previewing actually
 *      sees the thing they came to look at. This is how the panel's "Preview
 *      in a new tab" works, and the URL is shareable, which is most of what
 *      asking somebody "does this look right?" needs.
 *   2. the server, via GET /api/home-layout
 *   3. the mirror of the server's last answer, stamped before first paint by
 *      the inline bootstrap in index.html
 *   4. the arrangement the page is authored in — the defaults below
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

/** Keep in step with Modules\Theme\Models\HomeLayout::SECTIONS.
 *  `off` means the section is not rendered on that device — a style like any
 *  other, so it travels the same pipeline; see the PHP for the argument. */
export const SECTIONS = {
  category:     { styles: ['grid', 'loop', 'off'],           desktop: 'grid',   mobile: 'grid' },
  trust:        { styles: ['static', 'loop', 'off'],         desktop: 'static', mobile: 'loop' },
  premium:      { styles: ['march', 'rail', 'grid', 'off'],  desktop: 'march',  mobile: 'march' },
  bestseller:   { styles: ['grid', 'rail', 'march', 'off'],  desktop: 'grid',   mobile: 'grid' },
  new:          { styles: ['march', 'rail', 'grid', 'off'],  desktop: 'march',  mobile: 'march' },
  brands:       { styles: ['wall', 'loop', 'off'],           desktop: 'wall',   mobile: 'wall' },
  testimonials: { styles: ['slider', 'grid', 'loop', 'off'], desktop: 'slider', mobile: 'slider' },
};

/**
 * The sections a merchant may move, in the order index.html authors them.
 * Keep in step with Modules\Theme\Models\HomeLayout::MOVABLE.
 *
 * Not SECTIONS' keys: `news` has no choice of shape but is a section a
 * merchant may want higher, and `hero` has a shape but is pinned. The dormant
 * industry band is in neither list — it ships hidden.
 */
export const MOVABLE = [
  'trust', 'category', 'premium', 'bestseller', 'brands', 'new', 'testimonials', 'news',
];

/** Anything → a complete, valid order. Mirrors normaliseOrder() in PHP. */
export function normaliseOrder(raw) {
  const out = [];
  for (const name of Array.isArray(raw) ? raw : []) {
    if (MOVABLE.includes(name) && !out.includes(name)) out.push(name);
  }
  for (const name of MOVABLE) if (!out.includes(name)) out.push(name);
  return out;
}

/**
 * Anything → a complete, valid arrangement. Mirrors normalise() in PHP,
 * including its reading of a record written before ordering existed: one
 * carrying neither key IS the styles map, and gets the shipped order beside
 * it — which is the order that release was rendering anyway.
 */
export function normalise(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const wrapped = 'styles' in src || 'order' in src;
  const rawStyles = wrapped ? src.styles : src;
  const rawOrder = (wrapped && src.order && typeof src.order === 'object') ? src.order : {};

  const srcStyles = (rawStyles && typeof rawStyles === 'object') ? rawStyles : {};
  const styles = {};
  for (const [key, spec] of Object.entries(SECTIONS)) {
    const given = (srcStyles[key] && typeof srcStyles[key] === 'object') ? srcStyles[key] : {};
    styles[key] = {
      desktop: spec.styles.includes(given.desktop) ? given.desktop : spec.desktop,
      mobile: spec.styles.includes(given.mobile) ? given.mobile : spec.mobile,
    };
  }

  return {
    styles,
    order: {
      desktop: normaliseOrder(rawOrder.desktop),
      mobile: normaliseOrder(rawOrder.mobile),
    },
  };
}

/** The arrangement flattened to "what applies at this width". */
function resolve(layout, phone) {
  const shape = {};
  for (const key of Object.keys(SECTIONS)) {
    shape[key] = phone ? layout.styles[key].mobile : layout.styles[key].desktop;
  }
  return { shape, order: phone ? layout.order.mobile : layout.order.desktop };
}

/**
 * Put the sections in the given order, by moving them.
 *
 * Only elements carrying data-sec move, and only those the order names. The
 * <h1> and the hero above them are untouched, and so is anything unnamed that
 * happened to sit between two movable sections — it ends up after all of
 * them. Today that is only the dormant industry band, which ships hidden, so
 * there is nothing to see; a visible section added there later must be given
 * a name and a place in MOVABLE rather than left to be swept along.
 *
 * Returns without touching the DOM when the page is already in this order,
 * which is the common case on every call after the first.
 */
export function applyOrder(order) {
  const main = document.getElementById('main');
  if (!main) return;

  const nodes = new Map();
  for (const el of main.children) {
    const name = el.getAttribute?.('data-sec');
    if (name && order.includes(name)) nodes.set(name, el);
  }
  if (nodes.size < 2) return;

  const wanted = order.filter((name) => nodes.has(name));
  const current = [...nodes.keys()];
  if (wanted.join(' ') === current.join(' ')) return;

  /* A marker holds the place of the first movable section while the sections
     themselves are lifted out — without it, detaching them would lose the very
     position they need to be put back at. */
  const marker = document.createComment('sections');
  main.insertBefore(marker, nodes.get(current[0]));

  const frag = document.createDocumentFragment();
  for (const name of wanted) frag.appendChild(nodes.get(name));

  main.insertBefore(frag, marker);
  marker.remove();
}

function tokens(resolved) {
  return Object.entries(resolved).map(([k, v]) => `${k}:${v}`).join(' ');
}

function stamp(resolved) {
  document.documentElement.setAttribute('data-lay', tokens(resolved.shape));
}

/** Both halves of a resolved arrangement onto the page. */
function paint(resolved) {
  applyOrder(resolved.order);
  stamp(resolved);
}

/**
 * ?lay=category:loop+trust:static&ord=new,premium,… — a resolved arrangement,
 * straight from the panel's preview button.
 *
 * Every token is checked against the vocabulary before it is used, for the
 * same reason the server checks it: this string is somebody else's URL and it
 * ends up in an HTML attribute. Anything unrecognised is dropped, and a
 * parameter that survives with nothing in it is treated as no preview at all.
 */
function readPreview() {
  const params = new URLSearchParams(location.search);
  const rawShape = params.get('lay');
  const rawOrder = params.get('ord');
  if (!rawShape && !rawOrder) return null;

  const shape = {};
  for (const token of (rawShape || '').trim().split(/\s+/)) {
    const [section, style] = token.split(':');
    if (SECTIONS[section]?.styles.includes(style)) shape[section] = style;
  }

  /* normaliseOrder is what makes ?ord= safe to be short: it completes the list
     from the shipped order, so a preview URL only has to carry the move being
     previewed. It is also what makes ?ord= safe to be hostile — a name the
     page does not have cannot survive it. */
  const order = normaliseOrder((rawOrder || '').split(',').map((n) => n.trim()));

  // Unnamed sections keep the shape the page is authored in, for the same
  // reason: a preview URL carries only what it is actually changing.
  const phone = matchMedia(PHONE).matches;
  for (const [key, spec] of Object.entries(SECTIONS)) {
    shape[key] ??= phone ? spec.mobile : spec.desktop;
  }
  return { shape, order };
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
  /* A preview is already resolved for the width it was opened at — the panel
     builds it from the two dropdowns the merchant is looking at — so it is
     stamped once and left alone. Nothing is fetched and nothing is mirrored:
     a preview that wrote to storage would follow the merchant around the shop
     afterwards, showing them an arrangement no visitor is seeing. */
  const preview = readPreview();
  if (preview) {
    paint(preview);
    onChange(preview.shape);
    return;
  }

  const phone = matchMedia(PHONE);
  let layout = normalise(readMirror());
  let last = '';

  const apply = () => {
    const resolved = resolve(layout, phone.matches);
    const key = JSON.stringify(resolved);
    if (key === last) return;
    last = key;
    paint(resolved);
    onChange(resolved.shape);
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
