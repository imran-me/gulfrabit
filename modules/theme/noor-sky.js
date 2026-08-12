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
 * One meteor. Enters from the upper right, falls left and down — the
 * direction is fixed because a sky whose meteors come from everywhere reads
 * as random noise rather than weather. Everything else about it is rolled.
 */
function meteor(small) {
  const bright = Math.random() < 0.18;
  const angle = rand(16, 30);                        // degrees below horizontal
  const m = el('div', bright ? 'noor-meteor is-bright' : 'noor-meteor');

  const len = bright ? rand(150, 230) : rand(80, 160);
  const travel = rand(70, 125);                      // vw covered before it dies

  m.style.setProperty('--m-x', rand(60, 108).toFixed(1) + 'vw');
  m.style.setProperty('--m-y', rand(-2, 30).toFixed(1) + 'vh');
  m.style.setProperty('--m-len', (small ? len * 0.7 : len).toFixed(0) + 'px');
  m.style.setProperty('--m-thick', bright ? '3px' : '2px');
  m.style.setProperty('--m-angle', angle.toFixed(1) + 'deg');
  m.style.setProperty('--m-dx', (-travel).toFixed(1) + 'vw');
  // Fall consistent with the angle it is drawn at, or the streak points one
  // way and travels another — the single detail that makes a meteor read as
  // a sticker sliding across the page.
  m.style.setProperty('--m-dy', (travel * Math.tan(angle * Math.PI / 180)).toFixed(1) + 'vh');
  m.style.setProperty('--m-dur', rand(0.9, 2.1).toFixed(2) + 's');

  once(m);
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
 * @param {number} cap how many of this kind may exist at once
 */
function once(node, cap = 4) {
  const kind = node.className.split(' ')[0];
  if (document.querySelectorAll('.' + kind).length >= cap) return;

  const done = () => node.remove();
  node.addEventListener('animationend', done, { once: true });
  setTimeout(done, 30000);

  document.body.appendChild(node);
}
