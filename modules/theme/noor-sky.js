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
 * The weights live in BILL, below, and they are the whole design: 27 events
 * plus an empty beat, across 28 rows. They are NOT 27 kinds of falling star —
 * a satellite,
 * a comet whose tail points away from the moon, a gull that soars and an owl
 * that beats and a bat that hunts, a moth spiralling into a light, a paper
 * lantern shrinking as it recedes, bakhoor smoke going turbulent, a fish on a
 * real parabola, a diver's bubbles, heat lightning under the horizon, and a
 * gust that leans everything else in the sky as it passes.
 *
 * WHY EACH ONE HAS A PHYSICAL REFERENT
 * ------------------------------------
 * Every event here is a real thing that really behaves that way, and that is
 * a working constraint rather than a flourish. It settles arguments — how
 * fast should the satellite go, which way does the comet's tail point, does
 * the bubble speed up or slow down — with an answer instead of a preference,
 * and answers agree with each other in a way preferences do not. It is also
 * the only reason twenty-seven simultaneous ideas read as one sky rather than
 * as a stock animation pack.
 *
 * The distribution stays lopsided. Meteor and firefly together take 36% of
 * desktop rolls and 42% of phone ones, because a sky needs a heartbeat you
 * have stopped noticing before anything can register as rare, and the four
 * rarest rows in BILL are meant to be missed by most visits.
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

import { addBody, setWind, stopPhysics } from './noor-physics.js';

/** Every node this module creates carries the class its animation needs and
 *  this attribute, which is theme.js's kill switch for the whole night. */
const FX = 'data-noor-fx';

/** And this one, which is narrower: it marks SKY elements specifically, so
 *  the stylesheet's reduced-motion and print rules can be a single selector
 *  instead of a hand-maintained list of every class in the file. [data-noor-fx]
 *  could not do that job — it also carries the vignette, which is composition
 *  rather than motion and must survive reduced motion. */
const SKY = 'data-noor-sky';

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** vw and vh are different lengths. Anything that starts life measured in one
 *  and has to be placed in the other goes through here — the alternative is
 *  the class of bug that had meteors falling at 18deg while claiming 30. */
const vwToVh = (v) => (v * window.innerWidth) / window.innerHeight;

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

/** Stop rolling. The CSS-animated elements already in flight finish and remove
 *  themselves; the simulated ones have no animation to finish, so the engine
 *  is told outright — otherwise a rAF loop would keep integrating bodies for a
 *  theme the page is no longer wearing. */
export function stopNoorSky() {
  running = false;
  clearTimeout(timer);
  timer = 0;
  stopPhysics();
}

const isNight = () => document.documentElement.getAttribute('data-theme') === 'noor';

/**
 * THE BILL — every event the sky can stage, and how often.
 *
 * `w` is the desktop weight and `m` the phone weight; both are relative, not
 * percentages, so a new line can be added without renormalising the rest.
 * m:0 means the event never happens on a phone — either because it is too
 * large for the viewport (the comet's tail is longer than the screen), or
 * because it is a slow ambient wash that only pays off at desk distance.
 *
 * The shape of this table IS the design, and it is deliberately lopsided.
 * Meteor and firefly take 36% of desktop rolls between them (42% on a phone),
 * because a sky needs a heartbeat you stop noticing before the rare things can
 * register as rare. Everything below the fold happens once in a while, and the
 * four at the bottom happen once in a long while — a visitor who sees a comet
 * probably will not see another one, and that is the point.
 *
 * `nothing` earns its line. A beat where the sky does nothing is what stops
 * the rhythm resolving into a pattern; without it the gaps alone are a tell.
 */
const BILL = [
  /* the heartbeat */
  { w: 100, m: 100, fn: meteor },        // one small rock, sometimes a bright one
  { w: 52,  m: 46,  fn: firefly },       // an insect off the water
  { w: 30,  m: 22,  fn: spark },         // an ember cooling as it rises
  { w: 26,  m: 22,  fn: ripple },        // a ring on the lagoon
  { w: 16,  m: 14,  fn: nova },          // a star flares and settles
  /* the regulars */
  { w: 16,  m: 13,  fn: satellite },     // a point in a dead straight line
  { w: 14,  m: 12,  fn: bubbles },       // a diver's string of bubbles
  { w: 13,  m: 11,  fn: fish },          // a parabola out of the water and back
  { w: 12,  m: 9,   fn: gull },          // soaring, banking, no wingbeat
  { w: 11,  m: 8,   fn: smoke },         // bakhoor: laminar, then turbulent
  { w: 11,  m: 10,  fn: occult },        // a star winks out and returns
  { w: 10,  m: 9,   fn: bat },           // a search pattern, not a flight path
  { w: 10,  m: 8,   fn: moth },          // the logarithmic spiral
  { w: 10,  m: 8,   fn: dragonfly },     // hover, dart, hover
  { w: 10,  m: 0,   fn: cloud },         // occludes the stars; lit from the moon's side
  { w: 9,   m: 8,   fn: gust },          // wind — and everything light leans
  { w: 9,   m: 7,   fn: fanous },        // a sky lantern, shrinking as it recedes
  { w: 8,   m: 7,   fn: grazer },        // the shallow, slow, skipping meteor
  { w: 7,   m: 6,   fn: owl },           // slow, deep, silent, straight
  { w: 7,   m: 6,   fn: twin },          // two rocks on parallel tracks
  { w: 6,   m: 0,   fn: constellation }, // four real stars resolve into a figure
  { w: 6,   m: 5,   fn: flash },         // heat lightning below the horizon
  { w: 5,   m: 0,   fn: glitter },       // the moon's path on the water
  { w: 5,   m: 0,   fn: veil },          // airglow
  /* the once-in-a-long-whiles */
  { w: 3,   m: 0,   fn: comet },         // slow, and its tail points away from the moon
  { w: 3,   m: 2,   fn: bolide },        // a fireball that breaks up
  { w: 3,   m: 0,   fn: phoenix },       // the bird of fire
  /* the empty beat */
  { w: 12,  m: 14,  fn: null },
];

/**
 * A hard ceiling on how much sky exists at once.
 *
 * The weights above are a rate, not a population, and a rate does not bound
 * anything on its own: a run of long-lived events (a comet at 26s, a lantern
 * at 30s, a cloud at 52s) can overlap into a crowd that no single per-kind
 * cap in once() would catch, because each of them is under its own limit.
 * Every one of these is a composited layer, and the number that matters on a
 * mid-range phone is the total.
 */
const MAX_SKY = 26;

/**
 * The loop. One roll picks the delay, the next tick picks the event — so a
 * long gap can be followed by a quick pair, which is what a real sky does.
 */
function schedule(small, delay) {
  clearTimeout(timer);

  // Wider gaps on a phone: the same event count on a quarter of the area
  // reads as three times busier.
  const wait = delay ?? (small ? rand(2400, 8600) : rand(1100, 4600));

  timer = setTimeout(() => {
    if (!running || !isNight() || document.hidden) return;

    if (document.querySelectorAll('[' + SKY + ']').length < MAX_SKY) {
      const event = weighted(small);
      if (event) event(small);
    }

    schedule(small);
  }, wait);
}

/** One draw from BILL, by weight, for this screen size. */
function weighted(small) {
  let total = 0;
  for (const e of BILL) total += small ? e.m : e.w;

  let roll = Math.random() * total;
  for (const e of BILL) {
    roll -= small ? e.m : e.w;
    if (roll < 0) return e.fn;
  }
  return null;
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
 * several will see one at all. Like the constellation and the glitter path it
 * refuses to start while one is already in flight: two phoenixes is a parade,
 * and a parade is not rare.
 */
function phoenix() {
  if (document.querySelector('.noor-phoenix')) return;

  const p = el('div', 'noor-phoenix');
  p.style.setProperty('--p-y', rand(12, 40).toFixed(1) + 'vh');
  p.style.setProperty('--p-dur', rand(7.5, 12).toFixed(1) + 's');

  once(p);
}

/* ---- more rock ---------------------------------------------------------- */

/**
 * The earthgrazer. A rock that meets the atmosphere at so shallow an angle
 * that it skips along the top of it instead of diving through, and the whole
 * character of the thing follows from that: a far longer path through far
 * thinner air, so it is SLOW — seconds, not tenths — and long, and dim.
 *
 * The long trail is not a contradiction of the speed-drives-length rule in
 * streak(). Trail length is speed multiplied by how long the glow persists,
 * and up where the air is thin the glow persists for a very long time —
 * which is what `bulk` is for.
 */
function grazer(small) {
  streak({
    cls: 'noor-meteor is-grazer',
    angle: rand(3, 9),
    travel: rand(105, 150),
    speed: rand(22, 36),
    x: rand(98, 120),
    y: rand(8, 30),
    bulk: small ? 3.4 : 5.2,
    cap: 2,
  });
}

/**
 * Two rocks on parallel tracks — one that came in already broken. They share
 * an angle and a velocity exactly, and differ only in where they entered. Roll
 * those independently and you get two meteors that happened to coincide,
 * which the eye reads as a coincidence rather than as one event.
 */
function twin(small) {
  const shared = {
    angle: rand(16, 30),
    travel: rand(75, 112),
    speed: rand(60, 88),
    bulk: small ? 0.7 : 1,
    cap: 6,
  };
  const x = rand(66, 100);
  const y = rand(0, 22);

  streak({ ...shared, x, y });
  streak({ ...shared, x: x + rand(2.5, 7), y: y + rand(1.5, 4.5), delay: rand(0.05, 0.22) });
}

/**
 * The bolide: a fireball big enough to survive down into dense air, where the
 * pressure stacked in front of it finally exceeds what the rock can hold
 * together and it BREAKS.
 *
 * The fragments are the point, and three things make them read as a break-up
 * rather than a firework: they start at the parent's real position at the
 * moment of the break (not at the parent's origin), they INHERIT its velocity
 * rather than being thrown from it, and they diverge by only a few degrees —
 * asymmetrically, because a symmetric fan is what fireworks do.
 */
function bolide(small) {
  const x = rand(70, 106);
  const y = rand(-2, 18);
  const f = streak({
    cls: 'noor-meteor is-bright is-bolide',
    angle: rand(18, 32),
    travel: rand(80, 118),
    speed: rand(44, 62),
    x, y,
    bulk: small ? 1.6 : 2.6,
    thick: small ? '3px' : '4px',
    cap: 2,
  });

  // Where it comes apart, and when: 55% of the way down, in the densest air
  // it will ever meet. The drop is in vw and the start height is in vh, so
  // one of them has to be converted before they can be added.
  const at = 0.55;
  const bx = x - f.travel * at;
  const by = y + vwToVh(f.drop * at);
  const t = ((Math.hypot(f.travel, f.drop) / f.speed) * at);

  for (let i = 0, n = 2 + Math.floor(Math.random() * 2); i < n; i++) {
    streak({
      angle: f.angle + rand(-4.5, 6),
      travel: f.travel * rand(0.16, 0.34),
      speed: f.speed * rand(0.82, 1.02),
      x: bx + rand(-1.5, 1.5),
      y: by + rand(-1, 1),
      bulk: rand(0.5, 0.9),
      cap: 9,
      delay: t + rand(0, 0.12),
    });
  }
}

/* ---- things in orbit ---------------------------------------------------- */

/**
 * A satellite, and the reason both it and the meteors read correctly: it is a
 * POINT, in a DEAD STRAIGHT LINE, at a CONSTANT SPEED, with NO TRAIL, for
 * twenty seconds. Every one of those is wrong for a falling rock and right
 * for a thing in orbit — it is not burning, only reflecting, and it is not
 * falling, it is going round. Each makes the other more believable.
 */
function satellite(small) {
  // Roughly one in five carries a flare — a flat antenna catching the sun
  // square-on. Any more often and it stops being the one you were lucky to
  // still be looking at.
  const s = el('div', Math.random() < 0.2 ? 'noor-sat is-flare' : 'noor-sat');
  const east = Math.random() < 0.5;

  s.style.setProperty('--s-x', east ? '-4vw' : '104vw');
  s.style.setProperty('--s-y', rand(3, 32).toFixed(1) + 'vh');
  s.style.setProperty('--s-dx', ((east ? 1 : -1) * 120).toFixed(0) + 'vw');
  // Never level. Orbits are inclined, and a perfectly horizontal track reads
  // as a rendering artefact rather than as a satellite.
  s.style.setProperty('--s-dy', (rand(3, 15) * pick([1, -1])).toFixed(1) + 'vw');
  // Slow, and the same slow every time. Orbital speed is not a matter of
  // taste, and a satellite in a hurry is an aeroplane.
  s.style.setProperty('--s-dur', rand(15, 24).toFixed(1) + 's');

  once(s, 2);
}

/**
 * The comet — the slow one, and the only thing here that needed trigonometry.
 * See section 7 of the stylesheet for why its tail does not trail it.
 */
function comet() {
  const c = el('div', 'noor-comet');
  const east = Math.random() < 0.62;
  const x = east ? rand(-10, -4) : rand(102, 110);
  const y = rand(6, 30);
  const dx = (east ? 1 : -1) * rand(116, 128);
  const dy = rand(4, 14) * pick([1, -1]);

  c.style.setProperty('--c-x', x.toFixed(1) + 'vw');
  c.style.setProperty('--c-y', y.toFixed(1) + 'vh');
  c.style.setProperty('--c-dx', dx.toFixed(1) + 'vw');
  c.style.setProperty('--c-dy', dy.toFixed(1) + 'vw');
  c.style.setProperty('--c-size', rand(6, 10).toFixed(1) + 'px');
  c.style.setProperty('--c-tail', rand(150, 260).toFixed(0) + 'px');
  c.style.setProperty('--c-fan', rand(20, 38).toFixed(0) + 'px');
  c.style.setProperty('--c-dur', rand(18, 30).toFixed(1) + 's');
  c.style.setProperty('--c-angle', antiMoon(x + dx / 2, y + vwToVh(dy / 2)).toFixed(1) + 'deg');

  once(c, 1);
}

/**
 * The direction a comet's tail must point: directly away from the only light
 * in this sky. Measured from the moon's ACTUAL rendered box, because that box
 * is a clamp() of three different units and guessing it would be wrong at
 * most window widths.
 *
 * Taken at the MIDPOINT of the crossing rather than at the start. The honest
 * version re-measures every frame — a comet passing directly beneath the moon
 * really does swing its tail through a half-turn — but that is a
 * requestAnimationFrame running for half a minute to correct an angle nobody
 * is tracking that closely. The midpoint keeps the error small at both ends.
 *
 * @param {number} xvw comet position, vw
 * @param {number} yvh comet position, vh
 * @returns {number} degrees, already in CSS's rotation frame
 */
function antiMoon(xvw, yvh) {
  const r = document.querySelector('.noor-moon')?.getBoundingClientRect();
  const mx = r ? r.left + r.width / 2 : window.innerWidth * 0.88;
  const my = r ? r.top + r.height / 2 : window.innerHeight * 0.18;
  // atan2 over screen coordinates (y pointing DOWN) is already the CSS rotate
  // angle, because CSS rotation also runs from +x toward +y. No sign flip.
  return (Math.atan2((yvh / 100) * window.innerHeight - my,
                     (xvw / 100) * window.innerWidth - mx) * 180) / Math.PI;
}

/* ---- wings -------------------------------------------------------------- */
/* Five fliers, and what separates them is not the silhouette — nobody can
 * read a silhouette at 30px — it is the timing. See section 8 of the
 * stylesheet, where each one's gait is written out. */

/** Soaring, banking, no wingbeat. */
function gull() {
  const g = el('div', 'noor-gull');
  g.style.setProperty('--w-x', '-14vw');
  g.style.setProperty('--w-y', rand(14, 40).toFixed(1) + 'vh');
  g.style.setProperty('--w-dur', rand(11, 17).toFixed(1) + 's');
  once(g, 2);
}

/** Slow, deep, silent, straight. */
function owl() {
  const o = el('div', 'noor-owl');
  o.style.setProperty('--w-x', '-16vw');
  o.style.setProperty('--w-y', rand(26, 52).toFixed(1) + 'vh');
  o.style.setProperty('--w-dy', rand(-5, 3).toFixed(1) + 'vw');
  o.style.setProperty('--w-dur', rand(8, 13).toFixed(1) + 's');
  once(o, 1);
}

/** A search pattern, not a flight path. */
function bat() {
  const b = el('div', 'noor-bat');
  b.style.setProperty('--w-x', '-10vw');
  b.style.setProperty('--w-y', rand(8, 30).toFixed(1) + 'vh');
  b.style.setProperty('--w-dur', rand(2.8, 4.6).toFixed(1) + 's');
  once(b, 2);
}

/** The logarithmic spiral — a navigation bug, and why moths circle. */
function moth() {
  const m = el('div', 'noor-moth');
  m.style.setProperty('--w-x', rand(12, 84).toFixed(1) + 'vw');
  m.style.setProperty('--w-b', rand(8, 30).toFixed(1) + 'vh');
  m.style.setProperty('--w-dur', rand(9, 14).toFixed(1) + 's');
  once(m, 2);
}

/** Hover, dart, hover. Dead stop to full speed with nothing in between. */
function dragonfly() {
  const d = el('div', 'noor-dragonfly');
  d.style.setProperty('--w-x', rand(2, 46).toFixed(1) + 'vw');
  d.style.setProperty('--w-b', rand(6, 26).toFixed(1) + 'vh');
  d.style.setProperty('--w-dur', rand(7, 11).toFixed(1) + 's');
  once(d, 2);
}

/* ---- the lantern -------------------------------------------------------- */

/** A paper lantern let go at the shore. It rises because the air inside it is
 *  hot, it wanders because it is light enough for any breath to push, and it
 *  SHRINKS — see section 9. Nothing else in this sky recedes. */
function fanous(small) {
  const f = el('div', 'noor-fanous');
  if (!place(f, small ? 1 : 2)) return;

  /* The lightest thing in this sky, which makes it the one that shows the
     wind best: it has almost no momentum, so it does not so much resist a
     gust as agree with it, and it keeps whatever sideways drift the gust left
     it with long after the gust has gone. That persistence is the tell of a
     real integrator — an authored sway always returns to its own centre line.

     It shrinks because it is receding, and the shrinking is coupled to the
     climb rather than timed alongside it. `heat` doubles as the flame burning
     down: as it decays the lantern stops climbing, exactly as a real one does
     when its fuel is spent. */
  addBody(f, {
    x: (rand(6, 92) / 100) * window.innerWidth,
    y: window.innerHeight + 30,
    vx: rand(-16, 16),
    vy: -rand(26, 46),
    g: 190,
    lift: rand(1.25, 1.5),
    heat: 1,
    cool: 0.03,
    drag: 0.03,
    life: rand(26, 40),
    fade: 7,
    onStep: (b) => {
      // Distance, expressed the only way a flat screen can express it.
      b.scale = Math.max(0.3, 1 - (window.innerHeight - b.y) / (window.innerHeight * 1.5));
    },
  });
}

/* ---- weather ------------------------------------------------------------ */

/** A cloud, whose entire job is to occlude the stars behind it. */
function cloud() {
  const c = el('div', 'noor-cloud');
  c.style.setProperty('--cl-y', rand(2, 26).toFixed(1) + 'vh');
  c.style.setProperty('--cl-w', rand(34, 62).toFixed(0) + 'vw');
  c.style.setProperty('--cl-h', rand(9, 18).toFixed(0) + 'vh');
  c.style.setProperty('--cl-dur', rand(42, 70).toFixed(0) + 's');
  once(c, 2);
}

/** Airglow: a faint sheet the upper atmosphere emits on its own. */
function veil() {
  const v = el('div', 'noor-veil');
  v.style.setProperty('--v-x', rand(-6, 56).toFixed(1) + 'vw');
  v.style.setProperty('--v-w', rand(34, 58).toFixed(0) + 'vw');
  v.style.setProperty('--v-dur', rand(20, 34).toFixed(0) + 's');
  once(v, 1);
}

/** Heat lightning: a storm below the horizon. No bolt, no thunder. */
function flash() {
  const f = el('div', 'noor-flash');
  f.style.setProperty('--fl-x', rand(-8, 62).toFixed(1) + 'vw');
  f.style.setProperty('--fl-w', rand(30, 56).toFixed(0) + 'vw');
  f.style.setProperty('--fl-dur', rand(4, 7).toFixed(1) + 's');
  once(f, 1);
}

/** The CSS-animated bodies light enough to be leaned by a gust. The simulated
 *  ones are absent on purpose: they feel the wind as a force, not as a lean,
 *  and applying both would push them twice. */
const GUST_MOVES = '.noor-fly, .noor-smoke';

/**
 * The gust — the only event here that touches the others. A faint shear
 * crosses the page and everything airborne and light leans downwind, then
 * drifts back. Wind is a thing that happens TO a sky, not an object in it.
 *
 * The lean rides the standalone `translate` property rather than `transform`,
 * which is what lets it coexist with each element's own running animation
 * instead of obliterating it. See section 4 of the stylesheet.
 */
function gust() {
  const dir = pick([1, -1]);
  const g = el('div', 'noor-gust');
  g.style.setProperty('--g-dir', String(dir));
  g.style.setProperty('--g-dur', rand(2.8, 4.4).toFixed(1) + 's');
  once(g, 1);

  /* For the simulated bodies this is not a lean, it is AIR THAT IS MOVING.
     The engine measures every body's drag against it, so what each one does
     is decided by its own mass and cross-section rather than by anything
     written here: a spark drifts a couple of hundred pixels, a lantern leans
     and KEEPS the drift after the gust has gone, a fish on its short fast arc
     barely registers it, and a bubble underwater does not feel it at all.
     That spread is the point — one cause, four different answers, none of
     them authored. An authored lean gives every body the same answer and
     always returns it to its own centre line. */
  setWind(dir * rand(80, 170), rand(1400, 2600));

  // The CSS-animated bodies cannot be pushed, only leaned — see the
  // `translate` note in section 4 of the stylesheet. Both halves of the sky
  // answer the same gust; only one of them answers it with forces.
  document.querySelectorAll(GUST_MOVES).forEach((n) => {
    // Each body gets its own displacement. A swarm that all leans by the same
    // amount is a sheet of paper, not a swarm.
    n.style.setProperty('--gust', (dir * rand(1.2, 3.4)).toFixed(2) + 'vw');
    n.classList.add('is-gusted');
    // Nothing snaps back: the transition lives on the base class, so removing
    // the mark eases the element home as well.
    setTimeout(() => n.classList.remove('is-gusted'), rand(1800, 3000));
  });
}

/* ---- fire --------------------------------------------------------------- */

/**
 * Sparks off someone's fire. They come in handfuls, not one at a time, and
 * they all come off the SAME fire — so they share an origin and differ only
 * in how hard they were thrown. Each one cools from white to red as it climbs
 * (section 11), which is done entirely with opacity.
 */
function spark(small) {
  // The fire sits somewhere along the shore, not on the bottom edge of the
  // screen, and every spark in this handful leaves from the same one.
  const x = (rand(3, 95) / 100) * window.innerWidth;
  const y = window.innerHeight - (rand(-1, 7) / 100) * window.innerHeight;

  for (let i = 0, n = 2 + Math.floor(Math.random() * (small ? 2 : 4)); i < n; i++) {
    const s = el('div', 'noor-spark');
    s.style.setProperty('--sp-size', rand(1.8, 3.6).toFixed(1) + 'px');
    if (!place(s, small ? 6 : 12)) return;

    /* A spark rises for exactly as long as it is hot, and then it falls.
       Nothing here says so: `lift` is buoyancy expressed as a fraction of
       gravity and it is multiplied by `heat`, so as the ember cools the same
       gravity that was being cancelled starts to win. The turnover is not a
       keyframe, it is the moment heat crosses 1/lift — which is why no two
       sparks in a handful turn at the same height. */
    addBody(s, {
      x: x + rand(-14, 14),
      y,
      vx: rand(-40, 40),
      vy: -rand(120, 240),
      g: 620,
      lift: rand(1.15, 1.55),
      heat: 1,
      cool: rand(0.16, 0.3),
      // Tiny and light: it barely holds any momentum, so the gust throws it.
      drag: rand(0.010, 0.020),
      life: rand(4.5, 8),
      fade: 1.2,
      // The colour is the same number as the flight. --sp-heat crossfades the
      // white core off the red glow, so the ember goes red at exactly the
      // moment buoyancy stops beating gravity — because that is one moment.
      onStep: (b) => b.node.style.setProperty('--sp-heat', b.heat.toFixed(3)),
    });
  }
}

/** Bakhoor: a smoke column that is laminar, and then abruptly is not. */
function smoke() {
  const s = el('div', 'noor-smoke');
  s.style.setProperty('--sm-x', rand(4, 92).toFixed(1) + 'vw');
  // The coal is somewhere up the shore too, and never at the same height as
  // the last one — a row of columns all rising off one line reads as a fence.
  s.style.setProperty('--sm-b', rand(-2, 8).toFixed(1) + 'vh');
  s.style.setProperty('--sm-w', rand(6, 13).toFixed(0) + 'px');
  s.style.setProperty('--sm-dur', rand(13, 22).toFixed(1) + 's');
  once(s, 2);
}

/* ---- the water ---------------------------------------------------------- */

/**
 * Rings on the lagoon. Two of them, because a disturbance on water sends a
 * TRAIN of waves and never a single ring — the second is always smaller,
 * later and fainter than the first.
 *
 * @param {object} [at] an origin, when something specific caused this
 */
function ripple(small, at) {
  const x = at?.x ?? rand(6, 94);
  const b = at?.b ?? rand(1, 12);
  const size = rand(70, 150) * (small ? 0.7 : 1);

  for (let i = 0; i < 2; i++) {
    const r = el('div', 'noor-ripple');
    r.style.setProperty('--r-x', x.toFixed(1) + 'vw');
    r.style.setProperty('--r-b', b.toFixed(1) + 'vh');
    r.style.setProperty('--r-size', (size * (i ? 0.68 : 1)).toFixed(0) + 'px');
    r.style.setProperty('--r-dur', (rand(2.8, 4.2) * (i ? 0.85 : 1)).toFixed(2) + 's');
    once(r, 8, i ? rand(0.3, 0.55) : 0);
  }
}

/**
 * A fish, on a real parabola, with a nose that follows it — and a splash at
 * each end, because it broke the surface twice.
 *
 * There is no launch-angle arithmetic here any more. The keyframe version
 * needed one, because ten sampled keyframes had to be told what tilt to hold
 * at each instant; the integrator reads the angle off the live velocity every
 * step instead (`aim: true`), which is both exact and free.
 */
function fish(small) {
  const f = el('div', 'noor-fish');
  const dir = pick([1, -1]);
  const surface = window.innerHeight - (rand(2, 9) / 100) * window.innerHeight;
  const x = (rand(8, 88) / 100) * window.innerWidth;

  f.style.setProperty('--fi-w', (small ? rand(18, 26) : rand(24, 40)).toFixed(0) + 'px');
  // A fish swimming left is DRAWN facing left. The flip lives on the sprite so
  // it cannot collide with the transform the engine owns.
  if (dir < 0) f.classList.add('is-left');
  if (!place(f, 2)) return;

  /* Thrown once and then left alone. The arc is not described anywhere — it
     is what gravity does to a body that left the water at this speed, and
     three things follow from that which the hand-sampled parabola could not
     give: the apex and the flight time are consequences of one throw instead
     of three independent rolls that could contradict each other; `aim` reads
     the nose angle off the live velocity every step rather than approximating
     it at eight instants; and the entry splash is spawned wherever the fish
     ACTUALLY came down instead of where a keyframe assumed it would.

     What it does NOT do is get blown off course — a gust moves the landing
     point by about four pixels, because this is a dense body on a fast
     0.8-second arc and wind has almost no time to work on it. That is the
     correct answer and it is worth having: the spark beside it drifts a
     couple of hundred pixels in the same gust, and the contrast between them
     is what makes the wind legible at all. */
  const up = rand(560, 900);
  addBody(f, {
    x, y: surface,
    vx: dir * rand(90, 210),
    vy: -up,
    g: 1750,
    // Water-slick and heavy for its size: it holds its momentum.
    drag: 0.0006,
    aim: true,
    life: (2 * up) / 1750 + 0.5,
    fade: 0.18,
    // The entry splash goes where it ACTUALLY came down, not where a keyframe
    // assumed it would.
    onDeath: (b) => splash(small, b.x, surface),
  });

  splash(small, x, surface);                                     // the launch
}

/** Rings where something broke the surface, in viewport pixels. */
function splash(small, px, surfaceY) {
  ripple(small, {
    x: (px / window.innerWidth) * 100,
    b: ((window.innerHeight - surfaceY) / window.innerHeight) * 100,
  });
}

/**
 * A pearl diver's breath. One string, from one point, each bubble a little
 * behind the last — and every one of them accelerating and growing as it goes
 * up, which are the same fact told twice (section 12).
 */
function bubbles(small) {
  const x = (rand(8, 92) / 100) * window.innerWidth;
  const floor = window.innerHeight - (rand(0, 6) / 100) * window.innerHeight;
  const surface = window.innerHeight - (rand(14, 26) / 100) * window.innerHeight;

  for (let i = 0, n = 3 + Math.floor(Math.random() * (small ? 3 : 4)); i < n; i++) {
    const u = el('div', 'noor-bubble');
    u.style.setProperty('--bu-size', rand(3, 7).toFixed(1) + 'px');

    /* A bubble accelerates as it rises and grows as it rises, and those are
       not two behaviours — they are one. The pressure above it falls, so it
       expands; expanding displaces more water, so buoyancy increases; more
       buoyancy against the same drag means it goes faster. Here `grow` is the
       only input and the acceleration is a CONSEQUENCE, because negative
       gravity is scaled by the volume the growth produces.
       Delayed by index, because one breath leaves as a string. */
    /* Appended inside the timeout, not before it. place() puts the node in
       the document immediately and the engine only starts positioning it when
       addBody runs — so appending up front would park every bubble in the
       string at the origin, visible, for as much as a second and a half. The
       cap belongs here for the same reason: it should count what is in the
       water now, not what was there when the breath was drawn. */
    setTimeout(() => {
      if (!isNight() || !place(u, 14)) return;
      addBody(u, {
        x: x + rand(-9, 9), y: floor,
        vx: rand(-8, 8), vy: -rand(30, 55),
        g: -170,                              // negative: buoyancy, not weight
        alpha: 0.8,
        air: false,                           // it is under the water
        grow: rand(0.16, 0.28),
        // Water is three orders of magnitude more viscous than air, and a
        // bubble is slow — this is the one body here near the linear regime,
        // so its coefficient is large and it never really accelerates away.
        drag: 0.05,
        life: 9,
        fade: 0.05,
        onStep: (b) => {
          // Buoyancy tracks the volume it just gained.
          b.g = -170 * b.scale;
          // The surface. A bubble does not fade out on reaching it, it POPS —
          // a hard expansion and gone inside two frames.
          if (b.y <= surface && b.life > b.age + 0.05) {
            b.life = b.age + 0.05;
            b.fade = 0.05;
            b.grow = 22;
          }
        },
      });
    }, i * rand(180, 420));
  }
}

/** The moon's reflection, which is only ever directly below the moon. */
function glitter() {
  const g = el('div', 'noor-glitter');
  const r = document.querySelector('.noor-moon')?.getBoundingClientRect();
  const w = rand(140, 260);
  // A glitter path always points at the observer, so it hangs off the moon's
  // real centre line — measured, not assumed, because that centre is a
  // clamp() the stylesheet resolves differently at every width.
  const cx = r ? r.left + r.width / 2 : window.innerWidth * 0.88;

  g.style.setProperty('--gl-x', (cx - w / 2).toFixed(0) + 'px');
  g.style.setProperty('--gl-w', w.toFixed(0) + 'px');
  g.style.setProperty('--gl-dur', rand(16, 26).toFixed(0) + 's');
  once(g, 1);
}

/* ---- the stars answer --------------------------------------------------- */
/* Three events that work on the stars hangTheMoon already placed rather than
 * on anything of their own. Two of them — the flare and the occultation —
 * genuinely add no element at all; the constellation is the exception and
 * creates one SVG for the lines. All three make the sky's fixed points feel
 * like objects rather than wallpaper. */

/** One star flares by several magnitudes and settles. Red dwarfs do this. */
function nova() {
  const s = pick(idleStars());
  if (!s) return;
  s.classList.add('is-nova');
  // The mark has to come off, or that star can never flare again all visit.
  setTimeout(() => s.classList.remove('is-nova'), 2700);
}

/** A star goes out for a second. Something passed in front of it. */
function occult() {
  const s = pick(idleStars());
  if (!s) return;
  s.classList.add('is-occult');

  setTimeout(() => {
    s.classList.remove('is-occult');
    // Dropping the class restarts the twinkle shorthand from zero, and a
    // POSITIVE delay would leave the star sitting at its initial opacity —
    // invisible — for as much as six seconds, which looks exactly like the
    // occultation failing to end. A NEGATIVE delay starts the animation
    // already part-way through, so the star simply carries on.
    s.style.setProperty('--star-delay', '-' + rand(0.2, 4).toFixed(1) + 's');
  }, 2500);
}

/** Stars not already busy with one of the two events above. */
function idleStars() {
  return [...document.querySelectorAll('.noor-star:not(.is-nova):not(.is-occult)')];
}

/**
 * Four of the real stars on this page resolve into a figure.
 *
 * The chain is nearest-neighbour from a random start, and that is the whole
 * trick: joining four stars at random produces a scribble that crosses
 * itself, while joining each to its closest unused neighbour produces
 * something that looks intended. Which is honest — people only ever drew
 * lines between stars that already looked related.
 *
 * Because hangTheMoon scatters the stars differently on every load, the
 * constellation is different on every load too, and nothing had to author it.
 */
function constellation() {
  if (document.querySelector('.noor-lines')) return;

  const pts = [...document.querySelectorAll('.noor-star')].map((s) => {
    const r = s.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (pts.length < 4) return;

  const chain = pts.splice(Math.floor(Math.random() * pts.length), 1);
  const want = Math.min(pts.length, 3 + Math.floor(Math.random() * 2));
  for (let i = 0; i < want; i++) {
    const from = chain[chain.length - 1];
    const near = (p) => Math.hypot(p.x - from.x, p.y - from.y);
    let best = 0;
    for (let j = 1; j < pts.length; j++) if (near(pts[j]) < near(pts[best])) best = j;
    chain.push(pts.splice(best, 1)[0]);
  }

  // SVG, so it needs the namespaced constructor rather than el().
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'noor-lines');
  svg.setAttribute(FX, '');
  svg.setAttribute(SKY, '');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.setProperty('--ln-dur', rand(6, 9).toFixed(1) + 's');

  const poly = document.createElementNS(NS, 'polyline');
  // No viewBox: the SVG box IS the viewport (inset:0), so these viewport
  // pixels are already the right user units. The stars are position:fixed, so
  // scrolling cannot pull the lines off them either.
  poly.setAttribute('points', chain.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' '));
  svg.appendChild(poly);

  once(svg, 1);
}

/* ---- plumbing ---------------------------------------------------------- */

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  node.setAttribute(FX, '');
  node.setAttribute(SKY, '');
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
/**
 * once()'s sibling, for bodies the integrator owns.
 *
 * Same cap, but no `animationend` and no fallback timer, because a simulated
 * body has no animation to end and the engine already guarantees it leaves —
 * it dies of old age or of being off-screen, and either way the loop removes
 * it. Wiring the timeout as well would mean two owners for one node.
 *
 * @returns {boolean} false if the cap is already reached, in which case the
 *   caller must not simulate the node it just built.
 */
function place(node, cap) {
  const kind = (node.getAttribute('class') || '').split(' ')[0];
  if (document.querySelectorAll('.' + kind).length >= cap) return false;
  document.body.appendChild(node);
  return true;
}

function once(node, cap = 4, delay = 0) {
  // getAttribute, not .className: on an SVG element className is an
  // SVGAnimatedString, which has no .split — and the constellation is SVG.
  const kind = (node.getAttribute('class') || '').split(' ')[0];
  if (document.querySelectorAll('.' + kind).length >= cap) return;

  const done = () => node.remove();
  node.addEventListener('animationend', (e) => {
    if (e.target === node && !e.pseudoElement) done();
  });
  /* The backstop must outlast the LONGEST animation in the file, or it stops
     being a safety net and becomes a bug. It was 40s while a cloud drifts for
     42-70s and a fanous climbs for up to 40s — so most clouds were deleted at
     full opacity in the middle of the screen, and the MAX_SKY note in this
     file cited "a cloud at 52s" as a long-lived event that could not actually
     exist. 90s clears every roll in BILL with room to spare. */
  setTimeout(done, 90000);

  if (delay > 0) setTimeout(() => { if (isNight()) document.body.appendChild(node); }, delay * 1000);
  else document.body.appendChild(node);
}
