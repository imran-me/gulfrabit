/**
 * noor-sky.js — the conductor of Noor's sky.
 *
 * theme-noor-sky.css draws a moon, stars, meteors, fireflies and a phoenix.
 * This file decides WHICH of them happens, WHEN, and with what dimensions —
 * and then gets out of the way, because every animation above runs on the
 * compositor once its element exists.
 *
 * WHY A RANDOM LOOP AND NOT A SET OF CSS INTERVALS
 * ------------------------------------------------
 * Noor's existing ember is one streak of gold on a 27-second CSS loop, and 27
 * seconds is long enough for the eye to learn the beat and file it under
 * wallpaper. It stays — a sky has regular events as well as irregular ones —
 * but everything added here is the irregular half: the conductor rolls for
 * the next event AND for how long to wait, every time, so the rhythm never
 * resolves. The gaps are deliberately wide; a busy sky is a screensaver.
 *
 * The weights below are the whole design, and they are lopsided on purpose:
 *
 *   meteor   62%   the common event — you will see several a minute
 *   firefly  30%   one insect, drifting up off the water and gone
 *   phoenix   4%   rare enough that catching one is luck, not a feature
 *   nothing   4%   a beat where the sky simply does nothing, so the
 *                  rhythm never resolves into a pattern
 *
 * WHAT THIS FILE REFUSES TO DO
 * ----------------------------
 * - Run outside Noor. Every scheduled tick re-checks the live theme, so
 *   switching away stops the sky mid-flight rather than at the next roll.
 * - Run for anyone who asked for reduced motion. Checked before a single
 *   element is made — the CSS hides them too, and one of those locks is
 *   redundant on purpose.
 * - Run while the tab is hidden. Timers in a background tab pile up work
 *   nobody can see and drain a phone battery for nothing.
 * - Outlive its elements. Everything is removed on `animationend`, and
 *   everything carries [data-noor-fx] so applyTheme's own cleanup can take
 *   the whole sky down in one sweep.
 *
 * PHONES GET A SMALLER SKY
 * ------------------------
 * Not because the effects are expensive — they are composited transforms —
 * but because a 6-inch viewport with a desktop's worth of particles is a
 * different, busier design. Fewer stars, wider gaps, no phoenix.
 */

/** Every node this module creates carries the class its animation needs and
 *  this attribute, which is theme.js's kill switch for the whole night. */
const FX = 'data-noor-fx';

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let running = false;
let timer = 0;

/**
 * Start the sky. Idempotent — a second call while running is ignored, which
 * matters because applyTheme can re-arm Noor on a same-tab theme switch.
 */
export function startNoorSky() {
  if (running) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  running = true;
  const small = window.matchMedia('(max-width: 767.98px)').matches;

  hangTheMoon(small);

  // The first event comes quickly. A visitor who lands, looks up and sees a
  // still sky for seven seconds has already decided the page is static —
  // the wide gaps below are for holding attention, not for winning it.
  schedule(small, rand(500, 1600));

  // The tab going away pauses the roll; coming back resumes it. Without this
  // a backgrounded tab keeps minting elements nobody will ever see.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);
      timer = 0;
    } else if (running && isNight()) {
      schedule(small);
    }
  });
}

/** Stop rolling. The elements already in flight finish and remove themselves. */
export function stopNoorSky() {
  running = false;
  clearTimeout(timer);
  timer = 0;
}

const isNight = () => document.documentElement.getAttribute('data-theme') === 'noor';

/**
 * The loop. One roll picks the delay, the next tick picks the event — so a
 * long gap can be followed by a quick pair, which is what a real sky does.
 */
function schedule(small, delay) {
  clearTimeout(timer);

  // Wider gaps on a phone: the same event count on a quarter of the area
  // reads as three times busier.
  const wait = delay ?? (small ? rand(2200, 8000) : rand(1100, 4600));

  timer = setTimeout(() => {
    if (!running || !isNight() || document.hidden) return;

    const roll = Math.random();
    if (roll < 0.62) meteor(small);
    else if (roll < 0.92) firefly(small);
    else if (roll < 0.96 && !small) phoenix();
    // else: the empty beat. Deliberate — see the weights in the file comment.

    schedule(small);
  }, wait);
}

/**
 * The moon, its halo and a scatter of stars around it. Placed once per page
 * and left alone: it is the fixed point the moving things are read against.
 *
 * The stars avoid the moon's own corner by construction (they are placed
 * across the left three-quarters of the sky) — a star inside the halo is
 * invisible anyway, and one just outside it looks like a rendering mistake.
 */
function hangTheMoon(small) {
  if (document.querySelector('.noor-moon')) return;

  const moon = el('div', 'noor-moon');
  document.body.appendChild(moon);

  const count = small ? 5 : 9;
  for (let i = 0; i < count; i++) {
    const star = el('div', 'noor-star');
    star.style.setProperty('--star-x', rand(3, 74).toFixed(1) + 'vw');
    star.style.setProperty('--star-y', rand(4, 34).toFixed(1) + 'vh');
    star.style.setProperty('--star-size', rand(1.4, 2.8).toFixed(1) + 'px');
    // Distinct durations AND delays, or nine stars pulse as one organism.
    star.style.setProperty('--star-dur', rand(4.5, 9).toFixed(1) + 's');
    star.style.setProperty('--star-delay', rand(0, 6).toFixed(1) + 's');
    document.body.appendChild(star);
  }
}

/**
 * One streak of burning rock. Enters from the upper right, falls left and
 * down — the direction is fixed because a sky whose meteors come from
 * everywhere reads as random noise rather than weather.
 *
 * THE GEOMETRY, WHICH IS THE WHOLE JOB
 * ------------------------------------
 * A streak has to point where it is going. It travels down-LEFT, so its long
 * axis has to be rotated to 180 - angle; rotating by the raw angle points it
 * down-RIGHT, a mirror image of its own velocity, and that is what made the
 * old meteors read as decals dragged across the page rather than objects
 * moving through air.
 *
 * Both legs of the fall are in **vw**. The drop used to be in vh, and since
 * 1vh and 1vw are different lengths, a meteor declared at 30deg actually fell
 * at 18deg on a 16:9 desktop — the drawn angle and the travelled angle were
 * never the same number on any screen. One unit for both legs fixes that
 * everywhere at once.
 *
 * And the duration is DERIVED. Rolling a distance and a duration
 * independently, as this used to, put a 4.2x speed spread in a single sky:
 * two identical rocks, one snapping past and one strolling. Roll the velocity
 * instead — a real, narrow band — and divide.
 *
 * @param {object} o overrides; every field is optional and rolled if absent.
 */
function streak(o = {}) {
  const cls = o.cls ?? 'noor-meteor';
  const angle = o.angle ?? rand(16, 32);             // degrees below horizontal
  const travel = o.travel ?? rand(70, 125);          // vw crossed before it dies
  const drop = travel * Math.tan(angle * Math.PI / 180);   // vw, deliberately
  const speed = o.speed ?? rand(58, 96);             // vw per second

  const m = el('div', cls);
  m.style.setProperty('--m-x', (o.x ?? rand(60, 108)).toFixed(1) + 'vw');
  m.style.setProperty('--m-y', (o.y ?? rand(-2, 30)).toFixed(1) + 'vh');
  // A faster rock burns a longer trail; length is a consequence of speed,
  // not a second independent roll that can contradict it.
  m.style.setProperty('--m-len', ((o.bulk ?? 1) * speed * rand(1.5, 2.3)).toFixed(0) + 'px');
  m.style.setProperty('--m-thick', o.thick ?? '2px');
  m.style.setProperty('--m-angle', (180 - angle).toFixed(1) + 'deg');
  m.style.setProperty('--m-dx', (-travel).toFixed(1) + 'vw');
  m.style.setProperty('--m-dy', drop.toFixed(1) + 'vw');
  m.style.setProperty('--m-dur', (Math.hypot(travel, drop) / speed).toFixed(2) + 's');

  once(m, o.cap ?? 5, o.delay ?? 0);
  return { angle, travel, drop, speed };
}

/** The common event: one small rock, occasionally a bright one. */
function meteor(small) {
  const bright = Math.random() < 0.18;
  streak({
    cls: bright ? 'noor-meteor is-bright' : 'noor-meteor',
    bulk: (bright ? 1.7 : 1) * (small ? 0.7 : 1),
    thick: bright ? '3px' : '2px',
  });
}

/** One firefly, rising off the water at the bottom of the page. */
function firefly(small) {
  const f = el('div', 'noor-fly');

  f.style.setProperty('--f-x', rand(2, 96).toFixed(1) + 'vw');
  f.style.setProperty('--f-size', rand(2.5, 5).toFixed(1) + 'px');
  f.style.setProperty('--f-dur', rand(14, 26).toFixed(1) + 's');
  f.style.setProperty('--f-pulse', rand(1.4, 3.4).toFixed(2) + 's');
  // Sway both ways: half the insects lean left, or the swarm drifts as one.
  f.style.setProperty('--f-sway', (rand(1.5, 5) * pick([1, -1])).toFixed(2) + 'vw');

  once(f, small ? 3 : 6);
}

/**
 * The phoenix. Desktop only, and the rarest thing here — roughly one visit in
 * several will see one at all. It is also the only element that is skipped
 * when one is already in flight: two phoenixes is a parade, and a parade is
 * not rare.
 */
function phoenix() {
  if (document.querySelector('.noor-phoenix')) return;

  const p = el('div', 'noor-phoenix');
  p.style.setProperty('--p-y', rand(12, 40).toFixed(1) + 'vh');
  p.style.setProperty('--p-dur', rand(7.5, 12).toFixed(1) + 's');

  once(p);
}

/* ---- plumbing ---------------------------------------------------------- */

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  node.setAttribute(FX, '');
  // Every one of these is decoration. A screen reader must never meet one.
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/**
 * Add an element, and guarantee it leaves.
 *
 * `animationend` is the primary exit. The timeout behind it is not
 * belt-and-braces theatre: an element created in a tab that is backgrounded
 * before its first frame may never fire the event at all, and the leak that
 * causes is invisible until a long session has thousands of dead nodes in
 * the DOM.
 *
 * THE PSEUDO-ELEMENT TRAP. An animation running on ::before or ::after fires
 * its `animationend` ON THE HOST ELEMENT — there is no separate event target
 * for a pseudo-element. So a short flourish on a child (the satellite's
 * flare, the spark's cooling core) would delete the whole node the instant it
 * finished, cutting the parent's own flight off partway. `e.pseudoElement` is
 * the empty string only for the element's own animations, which is the one
 * signal that distinguishes them.
 *
 * @param {number} cap   how many of this kind may exist at once
 * @param {number} delay seconds to hold the element back before it is added
 */
function once(node, cap = 4, delay = 0) {
  const kind = node.className.split(' ')[0];
  if (document.querySelectorAll('.' + kind).length >= cap) return;

  const done = () => node.remove();
  node.addEventListener('animationend', (e) => {
    if (e.target === node && !e.pseudoElement) done();
  });
  setTimeout(done, 40000);

  if (delay > 0) setTimeout(() => { if (isNight()) document.body.appendChild(node); }, delay * 1000);
  else document.body.appendChild(node);
}
