/**
 * nakshi-scene.js — the conductor of Nakshi's field.
 *
 * theme-nakshi-scene.css draws the Sundarbans, the river, Dhaka, the tree of
 * life, and the animals a kantha carries. This decides WHICH of them happens,
 * WHEN, and where.
 *
 * WHAT MAKES THIS A DIFFERENT JOB FROM NOOR'S SKY
 * ----------------------------------------------
 * Noor's conductor rolls for weather. Weather has no memory, so it can roll
 * freely and the result reads as a sky. A LANDSCAPE has memory: a tiger and a
 * deer in the same ten seconds is not an event, it is a story with the wrong
 * ending, and a viewer who sees it once will look for it again. So this file
 * carries something Noor's does not need — a small set of rules about what
 * may not share the field:
 *
 *   - a tiger and a deer never overlap. Two boats do, two egrets do.
 *   - the tiger is rare and slow, and while one is crossing nothing else
 *     large enters. It is the largest motif in the file and it must be the
 *     one you notice.
 *   - the monsoon suppresses everything except the boat and the rain. Nothing
 *     grazes in the rain, and a rickshaw in a downpour is a different picture
 *     than the one this theme is telling.
 *
 * THE GAPS ARE MUCH WIDER THAN NOOR'S
 * -----------------------------------
 * A night sky is allowed to be busy — it is above you and you are not reading
 * it. A landscape sits at the foot of a shop and is in the same visual field
 * as the prices. Noor rolls every 1-5 seconds; this rolls every 8-26, and
 * most rolls are one small quiet thing.
 *
 * The same refusals as Noor's: never outside this theme, never under reduced
 * motion, never while the tab is hidden, and everything carries
 * [data-nakshi-scene] so it can be swept in one pass.
 */

const FX = 'data-nakshi-fx';
const SCENE = 'data-nakshi-scene';

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let running = false;
let timer = 0;

/** True while the monsoon is over the field — most motifs sit it out. */
let raining = false;

const isNakshi = () => document.documentElement.getAttribute('data-theme') === 'nakshi';
const alive = (cls) => document.querySelector('.' + cls) !== null;

/**
 * Start the field. Idempotent, for the same reason Noor's is: applyTheme can
 * re-arm the theme on a same-tab switch.
 */
export function startNakshiScene() {
  if (running) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  running = true;
  const small = window.matchMedia('(max-width: 767.98px)').matches;

  layTheCloth(small);

  // The first motif comes soon — a still landscape for twenty seconds is a
  // background image, and the visitor will have decided that before the first
  // roll lands.
  schedule(small, rand(900, 2400));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);
      timer = 0;
    } else if (running && isNakshi()) {
      schedule(small);
    }
  });
}

/** Stop rolling. What is already crossing finishes and removes itself. */
export function stopNakshiScene() {
  running = false;
  clearTimeout(timer);
  timer = 0;
  raining = false;
}

/**
 * The permanent field: the forest, the river, the skyline, the tree. Placed
 * once and never touched again — these are what the moving things are read
 * against, and a landscape whose landscape moves is a screensaver.
 *
 * The skyline is desktop-only. On a phone the bottom fifth of the viewport is
 * already carrying the forest and the river, and a third band in the same
 * space stops reading as depth and starts reading as clutter.
 */
function layTheCloth(small) {
  if (document.querySelector('.nakshi-forest')) return;

  for (const cls of ['nakshi-forest', 'nakshi-river', 'nakshi-tree']) {
    document.body.appendChild(el('div', cls));
  }
  if (!small) document.body.appendChild(el('div', 'nakshi-dhaka'));
}

/**
 * THE FIELD'S BILL.
 *
 * Weighted like Noor's, but the shape is different on purpose: there is no
 * dominant heartbeat here. The quiet motifs — the lily, the fireflies, the
 * boat — carry most of the rolls, and the animals are the ones you wait for.
 *
 * `solo` marks a motif that will not enter while another solo motif is in the
 * field. That is the memory a landscape needs and a sky does not.
 * `dry` marks a motif that refuses to appear in the rain.
 */
const BILL = [
  { w: 30, m: 26, fn: jonaki,   dry: true },
  { w: 22, m: 20, fn: shapla,   dry: true },
  { w: 20, m: 18, fn: boat },
  { w: 16, m: 13, fn: egret,    dry: true },
  { w: 13, m: 10, fn: deer,     dry: true, solo: true },
  { w: 12, m: 10, fn: rickshaw, dry: true },
  { w: 10, m: 8,  fn: kite,     dry: true },
  { w: 6,  m: 5,  fn: monsoon },
  { w: 5,  m: 4,  fn: tiger,    dry: true, solo: true },
  { w: 16, m: 20, fn: null },                     // the empty beat
];

/** Nothing large may share the field with these. */
const SOLO = '.nakshi-tiger, .nakshi-deer';

/** The ceiling on how much field exists at once. */
const MAX_SCENE = 14;

function schedule(small, delay) {
  clearTimeout(timer);

  // Far wider than Noor's. A landscape at the foot of a shop shares a visual
  // field with the prices; a sky does not.
  const wait = delay ?? (small ? rand(11000, 30000) : rand(8000, 26000));

  timer = setTimeout(() => {
    if (!running || !isNakshi() || document.hidden) return;

    if (document.querySelectorAll('[' + SCENE + ']').length < MAX_SCENE) {
      const event = weighted(small);
      if (event) event(small);
    }

    schedule(small);
  }, wait);
}

/**
 * One draw, with the field's rules applied BEFORE the weighting rather than
 * after. Rejecting a motif after it is chosen and re-rolling would quietly
 * bias the distribution toward whatever is left; removing the ineligible ones
 * from the pool first keeps the remaining weights honest relative to each
 * other.
 */
function weighted(small) {
  const soloOut = document.querySelector(SOLO) !== null;
  const pool = BILL.filter((e) => {
    if (raining && e.dry) return false;
    if (soloOut && e.solo) return false;
    return true;
  });

  let total = 0;
  for (const e of pool) total += small ? e.m : e.w;
  if (total <= 0) return null;

  let roll = Math.random() * total;
  for (const e of pool) {
    roll -= small ? e.m : e.w;
    if (roll < 0) return e.fn;
  }
  return null;
}

/* ---- the animals -------------------------------------------------------- */

/** The tiger. The largest motif here, and the rarest — see the file note. */
function tiger(small) {
  if (alive('nakshi-tiger')) return;
  const t = el('div', 'nakshi-tiger');
  if (Math.random() < 0.5) t.classList.add('is-left');
  t.style.setProperty('--n-b', rand(1.5, 5).toFixed(1) + 'vh');
  // Slow. A prowling tiger crossing a viewport in under half a minute is a
  // house cat, and the two pauses written into the keyframes need room.
  t.style.setProperty('--n-dur', rand(30, 46).toFixed(0) + 's');
  once(t, 1);
}

/** The chital, grazing until something alarms it. */
function deer(small) {
  if (alive('nakshi-deer')) return;
  const d = el('div', 'nakshi-deer');
  if (Math.random() < 0.5) d.classList.add('is-left');
  d.style.setProperty('--n-x', rand(8, 55).toFixed(1) + 'vw');
  d.style.setProperty('--n-b', rand(2.5, 6).toFixed(1) + 'vh');
  d.style.setProperty('--n-dur', rand(15, 22).toFixed(0) + 's');
  once(d, 1);
}

/** A nouka under sail. Two may share the river; three is a regatta. */
function boat(small) {
  const b = el('div', 'nakshi-boat');
  if (Math.random() < 0.4) b.classList.add('is-left');
  b.style.setProperty('--n-b', rand(0.5, 4).toFixed(1) + 'vh');
  b.style.setProperty('--n-dur', rand(40, 62).toFixed(0) + 's');
  once(b, 2);
}

/** বক — one, or a loose line of them. */
function egret(small) {
  // Egrets fly home in ragged lines at dusk, never in formation and never
  // quite evenly spaced. A single bird is commoner than a line.
  const n = Math.random() < 0.62 ? 1 : 2 + Math.floor(Math.random() * (small ? 1 : 3));
  const base = rand(20, 46);

  for (let i = 0; i < n; i++) {
    const e = el('div', 'nakshi-egret');
    e.style.setProperty('--n-b', (base + rand(-4, 4)).toFixed(1) + 'vh');
    e.style.setProperty('--n-dur', rand(13, 19).toFixed(1) + 's');
    once(e, 5, i * rand(0.5, 1.4));
  }
}

/** Dhaka's rickshaw, and the only loud thing in the field. */
function rickshaw(small) {
  const r = el('div', 'nakshi-rickshaw');
  if (Math.random() < 0.5) r.classList.add('is-left');
  r.style.setProperty('--n-b', rand(1, 3.5).toFixed(1) + 'vh');
  r.style.setProperty('--n-dur', rand(26, 40).toFixed(0) + 's');
  once(r, 1);
}

/** সাকরাইন — a kite on its line. */
function kite(small) {
  const k = el('div', 'nakshi-kite');
  k.style.setProperty('--n-x', rand(12, 84).toFixed(1) + 'vw');
  k.style.setProperty('--n-y', rand(8, 26).toFixed(1) + 'vh');
  k.style.setProperty('--n-dur', rand(20, 30).toFixed(0) + 's');
  once(k, small ? 1 : 2);
}

/* ---- the small things --------------------------------------------------- */

/** শাপলা, opening on the water. */
function shapla(small) {
  const s = el('div', 'nakshi-shapla');
  s.style.setProperty('--n-x', rand(4, 92).toFixed(1) + 'vw');
  s.style.setProperty('--n-b', rand(1, 6).toFixed(1) + 'vh');
  s.style.setProperty('--n-size', rand(20, 40).toFixed(0) + 'px');
  s.style.setProperty('--n-dur', rand(11, 18).toFixed(0) + 's');
  once(s, 4);
}

/**
 * জোনাকি — and the one piece of real natural history in this file.
 *
 * Bangladesh has synchronous fireflies: a whole tree of them flashes together
 * on one beat, which is rare enough worldwide that most people have never
 * seen it. So every insect in a group is given the SAME animation-delay, and
 * the cluster blinks as one organism.
 *
 * That is the exact opposite of what Noor's conductor does two files away,
 * where distinct delays are forced precisely so nine stars do not pulse
 * together. Same technique, opposite sign, because they are describing
 * different animals — and it only works because the rest of each theme has
 * earned the difference.
 */
function jonaki(small) {
  const sync = '-' + rand(0, 1.4).toFixed(2) + 's';
  const x = rand(6, 90);
  const b = rand(4, 14);

  for (let i = 0, n = 3 + Math.floor(Math.random() * (small ? 3 : 5)); i < n; i++) {
    const j = el('div', 'nakshi-jonaki');
    j.style.setProperty('--n-x', (x + rand(-7, 7)).toFixed(1) + 'vw');
    j.style.setProperty('--n-b', (b + rand(-3, 3)).toFixed(1) + 'vh');
    j.style.setProperty('--n-sway', (rand(1.5, 4.5) * pick([1, -1])).toFixed(2) + 'vw');
    j.style.setProperty('--n-dur', rand(10, 16).toFixed(1) + 's');
    // The shared beat.
    j.style.setProperty('--n-sync', sync);
    once(j, 16);
  }
}

/**
 * বর্ষা. It sets a flag as well as an element, and the flag is the point:
 * while it is over the field, everything that would not be out in it stays
 * away. See weighted().
 */
function monsoon(small) {
  if (raining) return;
  const r = el('div', 'nakshi-rain');
  const dur = rand(10, 17);
  r.style.setProperty('--n-dur', dur.toFixed(1) + 's');
  raining = true;
  // Cleared slightly before the animation ends, so the field is repopulating
  // as the last of the rain fades rather than after it — which is what the
  // end of a shower looks like.
  setTimeout(() => { raining = false; }, (dur - 2.5) * 1000);
  once(r, 1);
}

/* ---- plumbing ----------------------------------------------------------- */

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  node.setAttribute(FX, '');
  node.setAttribute(SCENE, '');
  // Decoration. A screen reader must never meet a tiger.
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/**
 * Add an element and guarantee it leaves. Same contract as Noor's once(),
 * including the pseudo-element trap: an `animationend` from a ::before fires
 * on the HOST, and almost everything in this file has a gait animation on its
 * ::before that is shorter than its crossing. Without the guard a tiger would
 * delete itself on its first footfall.
 *
 * The backstop timeout is long here because the crossings are: a boat takes
 * up to 62 seconds and a tiger up to 46.
 */
function once(node, cap = 3, delay = 0) {
  const kind = (node.getAttribute('class') || '').split(' ')[0];
  if (document.querySelectorAll('.' + kind).length >= cap) return;

  const done = () => node.remove();
  node.addEventListener('animationend', (e) => {
    if (e.target === node && !e.pseudoElement) done();
  });
  setTimeout(done, 90000);

  if (delay > 0) setTimeout(() => { if (isNakshi()) document.body.appendChild(node); }, delay * 1000);
  else document.body.appendChild(node);
}
