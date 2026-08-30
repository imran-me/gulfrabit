/**
 * brain.js — what the rabbit does, and why it does it then.
 *
 * POSES, NOT CLIPS
 * ----------------
 * Every animation here is a function of one number: how far through the state
 * we are. There are no AnimationClips and no keyframes, for three reasons that
 * all matter more than authoring convenience:
 *
 *   1. Blending. Every state eases toward its pose through the same spring, so
 *      any state can interrupt any other without a transition being authored
 *      for that pair. Baked clips would need a matrix of cross-fades.
 *   2. Reaction. A hop has to land where the rabbit is actually going, and the
 *      head has to turn to wherever the pointer really is. Both are arithmetic
 *      on live values, which a recorded clip cannot do.
 *   3. Weight. A clip set for eight behaviours is data; this is a page of maths
 *      and costs nothing to download.
 *
 * THE RULE ABOUT ATTENTION
 * ------------------------
 * This is a shop. The mascot lives along the bottom edge, never crosses the
 * middle of the screen, never covers a control, and goes to sleep when nothing
 * is happening rather than performing to an empty room. A mascot that competes
 * with the buy button is a mascot that costs money.
 */

/** Every state, and how long it runs before the brain picks again. */
const STATES = {
  // The default. Breathing, the odd blink, ears drifting.
  idle:    { min: 2.2, max: 5.0 },
  // A single hop, landing somewhere new.
  hop:     { min: 0.62, max: 0.62 },
  // Several hops in a row, faster and flatter.
  dash:    { min: 1.5, max: 2.6 },
  // Sits up tall and looks around — the "is anyone there" pose.
  alert:   { min: 1.4, max: 2.8 },
  // Grooming: a paw goes over an ear and pulls it down.
  wash:    { min: 2.0, max: 3.2 },
  // A thump of the back foot, which is what a real rabbit does when pleased or
  // annoyed and is the single most rabbit-like thing it can do.
  thump:   { min: 0.9, max: 0.9 },
  // Curled up, ears flat. Only after a long silence.
  sleep:   { min: 6.0, max: 14.0 },
};

/**
 * What may follow what.
 *
 * A table rather than random choice over all states, because the sequence is
 * most of the character: a rabbit that hops twice and then washes its face
 * reads as an animal, and one that cycles uniformly through eight behaviours
 * reads as a screensaver.
 */
const NEXT = {
  idle:  ['hop', 'hop', 'alert', 'wash', 'dash', 'thump', 'idle'],
  hop:   ['hop', 'idle', 'idle', 'dash', 'alert'],
  dash:  ['idle', 'idle', 'alert'],
  alert: ['idle', 'hop', 'wash'],
  wash:  ['idle', 'idle', 'hop'],
  thump: ['idle', 'hop'],
  sleep: ['alert'],          // waking up is always a look around first
};

/** Seconds of no pointer, scroll or key before the rabbit dozes off. */
const BOREDOM = 22;

export function createBrain(rig, opts = {}) {
  const { byName } = rig;

  const s = {
    state: 'idle',
    t: 0,                    // seconds spent in this state
    hold: 3,                 // seconds to spend before choosing again

    x: 0,                    // where it is, in world units
    targetX: 0,              // where this hop is taking it
    fromX: 0,
    facing: 1,               // 1 = right, -1 = left
    y: 0,                    // hop height above the floor

    blink: 0,                // 0 open, 1 shut
    nextBlink: 2,
    look: { x: 0, y: 0 },    // where the head is turned, -1..1
    idleFor: 0,              // seconds since the visitor last did anything

    bounds: opts.bounds ?? 2.4,
  };

  /* ---- Input the rabbit notices --------------------------------------- */

  /** The visitor did something; wake up if asleep. */
  function stir() {
    s.idleFor = 0;
    if (s.state === 'sleep') enter('alert');
  }

  /**
   * Look toward the pointer.
   *
   * Clamped hard, because an animal whose head swivels past its shoulders is
   * unsettling rather than charming — and because the neck bone here has no
   * limits of its own.
   */
  function lookAt(nx, ny) {
    s.look.x = Math.max(-1, Math.min(1, nx));
    s.look.y = Math.max(-1, Math.min(1, ny));
    stir();
  }

  /** A fast scroll makes it run; a slow one only wakes it. */
  function scrolled(speed) {
    stir();
    if (speed > 1.6 && s.state !== 'dash' && s.state !== 'sleep') enter('dash');
  }

  /** Clicked on. The one thing it does purely because it was asked. */
  function poke() {
    stir();
    enter('thump');
  }

  function enter(next) {
    s.state = next;
    s.t = 0;

    const spec = STATES[next];
    s.hold = spec.min + Math.random() * (spec.max - spec.min);

    if (next === 'hop' || next === 'dash') {
      s.fromX = s.x;
      // Somewhere else, but never so far that it crosses the whole screen in
      // one bound — and never outside the strip it is allowed to live in.
      const reach = next === 'dash' ? 1.5 : 0.85;
      const wander = (Math.random() * 2 - 1) * reach;
      s.targetX = Math.max(-s.bounds, Math.min(s.bounds, s.x + wander));

      // Turn to face the way it is going. A rabbit hopping backwards is the
      // kind of thing nobody can name but everybody notices.
      if (Math.abs(s.targetX - s.fromX) > 0.05) {
        s.facing = s.targetX > s.fromX ? 1 : -1;
      }
    }
  }

  /* ---- The tick -------------------------------------------------------- */

  function update(dt, time) {
    s.t += dt;
    s.idleFor += dt;

    // Nothing has happened for a while. Only from idle: interrupting a hop
    // mid-air to fall asleep would drop the rabbit out of the sky.
    if (s.idleFor > BOREDOM && s.state === 'idle') enter('sleep');

    if (s.t >= s.hold) {
      const pool = NEXT[s.state] ?? NEXT.idle;
      enter(pool[Math.floor(Math.random() * pool.length)]);
    }

    // Reset each frame. Every pose below is written as an offset from the
    // bind pose, so anything a previous state bent has to be let go of first —
    // otherwise a curled ear from `sleep` would still be curled three states
    // later, and the bug would look like a modelling mistake.
    neutral();

    const k = Math.min(1, s.t / s.hold);   // 0..1 through this state

    switch (s.state) {
      case 'hop':   poseHop(k); break;
      case 'dash':  poseDash(k, time); break;
      case 'alert': poseAlert(k, time); break;
      case 'wash':  poseWash(k, time); break;
      case 'thump': poseThump(k); break;
      case 'sleep': poseSleep(k, time); break;
      default:      poseIdle(time);
    }

    blinking(dt);
    heading(dt);
  }

  /* ---- Poses ----------------------------------------------------------- */

  function neutral() {
    for (const bone of rig.bones) bone.rotation.set(0, 0, 0);
    byName.hips.position.y = byName.hips.userData.restY ??= byName.hips.position.y;
    s.y = 0;
  }

  /** Breathing, and ears that drift as if listening to something. */
  function poseIdle(time) {
    const breath = Math.sin(time * 1.9) * 0.022;
    byName.chest.rotation.x = breath;
    byName.spine.rotation.x = breath * 0.5;

    byName.earL.rotation.z = 0.05 + Math.sin(time * 0.7) * 0.05;
    byName.earR.rotation.z = -0.05 - Math.sin(time * 0.7 + 1.1) * 0.05;
    byName.earLTip.rotation.x = Math.sin(time * 1.3) * 0.06;
    byName.earRTip.rotation.x = Math.sin(time * 1.3 + 0.6) * 0.06;

    byName.tail.rotation.x = Math.sin(time * 2.4) * 0.08;
  }

  /**
   * One hop, as three acts: gather, fly, land.
   *
   * The arc is a sine rather than real gravity. A ballistic curve is correct
   * and reads as heavy — it spends most of its time near the top, which is
   * what a thrown rock does. A sine spends its time in the middle, which is
   * what a light animal doing it on purpose looks like.
   */
  function poseHop(k) {
    const crouch = k < 0.18 ? k / 0.18 : 0;
    const air = k >= 0.18 && k < 0.86 ? (k - 0.18) / 0.68 : -1;
    const land = k >= 0.86 ? (k - 0.86) / 0.14 : 0;

    if (crouch > 0) {
      // Gather. Everything compresses toward the floor.
      const c = Math.sin(crouch * Math.PI * 0.5);
      byName.hips.position.y -= c * 0.10;
      byName.thighL.rotation.x = byName.thighR.rotation.x = c * 0.6;
      byName.shinL.rotation.x = byName.shinR.rotation.x = -c * 0.9;
      byName.spine.rotation.x = c * 0.22;
      byName.earL.rotation.x = byName.earR.rotation.x = c * 0.3;
    }

    if (air >= 0) {
      s.y = Math.sin(air * Math.PI) * 0.62;
      s.x = s.fromX + (s.targetX - s.fromX) * easeInOut(air);

      // Legs trail on the way up and reach on the way down — the tuck.
      const tuck = Math.sin(air * Math.PI);
      byName.thighL.rotation.x = byName.thighR.rotation.x = -0.5 * tuck;
      byName.shinL.rotation.x = byName.shinR.rotation.x = 1.1 * tuck;
      byName.footL.rotation.x = byName.footR.rotation.x = -0.5 * tuck;

      // The back arches over the top of the arc.
      byName.spine.rotation.x = -0.24 * tuck;
      byName.chest.rotation.x = -0.12 * tuck;

      // Ears stream backwards, and lag the body — they are the only part of
      // this animal that should ever look floppy.
      const stream = Math.sin(air * Math.PI) * 0.9;
      byName.earL.rotation.x = byName.earR.rotation.x = -stream * 0.55;
      byName.earLTip.rotation.x = byName.earRTip.rotation.x = -stream * 0.7;

      byName.armL.rotation.x = byName.armR.rotation.x = -0.7 * tuck;
      byName.tail.rotation.x = 0.3 * tuck;
    }

    if (land > 0) {
      // Absorb. The squash is brief and deep — it is what sells the weight of
      // everything that came before it.
      const l = Math.sin(land * Math.PI);
      byName.hips.position.y -= l * 0.09;
      byName.thighL.rotation.x = byName.thighR.rotation.x = l * 0.7;
      byName.shinL.rotation.x = byName.shinR.rotation.x = -l * 0.8;
      byName.earL.rotation.x = byName.earR.rotation.x = l * 0.45;
      byName.earLTip.rotation.x = byName.earRTip.rotation.x = l * 0.5;
      s.x = s.targetX;
    }
  }

  /** Several flat, quick bounds. The same shapes as a hop, smaller and faster. */
  function poseDash(k, time) {
    const cycle = (time * 6.2) % 1;
    s.y = Math.abs(Math.sin(cycle * Math.PI)) * 0.24;
    s.x = s.fromX + (s.targetX - s.fromX) * easeInOut(k);

    const c = Math.sin(cycle * Math.PI * 2);
    byName.thighL.rotation.x = -0.45 + c * 0.5;
    byName.thighR.rotation.x = -0.45 - c * 0.5;
    byName.shinL.rotation.x = 0.7 - c * 0.4;
    byName.shinR.rotation.x = 0.7 + c * 0.4;

    byName.spine.rotation.x = -0.14 + c * 0.1;
    byName.earL.rotation.x = byName.earR.rotation.x = -0.55;
    byName.earLTip.rotation.x = byName.earRTip.rotation.x = -0.4 + c * 0.12;
    byName.armL.rotation.x = -0.5 - c * 0.3;
    byName.armR.rotation.x = -0.5 + c * 0.3;
  }

  /** Sits up, ears straight, scanning. */
  function poseAlert(k, time) {
    const rise = Math.min(1, k * 4);
    byName.spine.rotation.x = -0.34 * rise;
    byName.chest.rotation.x = -0.2 * rise;
    byName.neck.rotation.x = -0.12 * rise;

    byName.thighL.rotation.x = byName.thighR.rotation.x = 0.5 * rise;
    byName.armL.rotation.x = byName.armR.rotation.x = -1.0 * rise;
    byName.pawL.rotation.x = byName.pawR.rotation.x = -0.5 * rise;

    // Ears bolt upright and swivel independently, which is the tell.
    byName.earL.rotation.x = byName.earR.rotation.x = 0.08 * rise;
    byName.earL.rotation.z = 0.02 + Math.sin(time * 2.6) * 0.09;
    byName.earR.rotation.z = -0.02 - Math.sin(time * 2.2) * 0.09;

    // Scanning is a slow sweep, not a look at anything in particular.
    byName.head.rotation.y = Math.sin(time * 0.9) * 0.42 * rise;
  }

  /** A paw hooks over one ear and pulls it down, then lets it spring back. */
  function poseWash(k, time) {
    const rise = Math.min(1, k * 3);
    byName.spine.rotation.x = -0.3 * rise;
    byName.thighL.rotation.x = byName.thighR.rotation.x = 0.45 * rise;

    const stroke = (Math.sin(time * 5.5) + 1) / 2;      // 0..1

    byName.armL.rotation.x = -1.5 * rise;
    byName.armL.rotation.z = (0.35 + stroke * 0.35) * rise;
    byName.pawL.rotation.x = -0.8 * rise;

    byName.armR.rotation.x = -0.9 * rise;

    // The ear being groomed follows the paw down and is dragged forward.
    byName.earL.rotation.x = (0.5 + stroke * 0.7) * rise;
    byName.earL.rotation.z = 0.4 * rise;
    byName.earLTip.rotation.x = (0.4 + stroke * 0.5) * rise;
    byName.earR.rotation.x = -0.06;

    byName.head.rotation.z = 0.16 * rise;
    byName.head.rotation.x = 0.14 * rise;
  }

  /** The back-foot thump. Two beats, then held. */
  function poseThump(k) {
    const beat = Math.sin(k * Math.PI * 4);
    const decay = 1 - k;

    byName.thighR.rotation.x = 0.5 * Math.max(0, beat) * decay;
    byName.shinR.rotation.x = -0.8 * Math.max(0, beat) * decay;
    byName.footR.rotation.x = -0.7 * Math.max(0, beat) * decay;

    // The whole animal shakes a little with it, which is what makes it read as
    // a thump rather than a kick.
    const shake = Math.max(0, beat) * decay * 0.05;
    byName.hips.position.y -= shake;
    byName.spine.rotation.x = shake * 2;
    byName.earL.rotation.x = byName.earR.rotation.x = shake * 3;
  }

  /** Curled, ears flat along the back, breathing slowly. */
  function poseSleep(k, time) {
    const settle = Math.min(1, k * 3);
    const breath = Math.sin(time * 0.85) * 0.03;

    byName.hips.position.y -= 0.16 * settle;
    byName.spine.rotation.x = (0.34 + breath) * settle;
    byName.chest.rotation.x = 0.26 * settle;
    byName.neck.rotation.x = 0.34 * settle;
    byName.head.rotation.x = 0.28 * settle;
    byName.head.rotation.z = 0.2 * settle;

    // Flat down the back. A sleeping rabbit's ears are the whole picture.
    byName.earL.rotation.x = 1.5 * settle;
    byName.earR.rotation.x = 1.45 * settle;
    byName.earL.rotation.z = 0.32 * settle;
    byName.earR.rotation.z = -0.28 * settle;
    byName.earLTip.rotation.x = 0.45 * settle;
    byName.earRTip.rotation.x = 0.42 * settle;

    byName.thighL.rotation.x = byName.thighR.rotation.x = 0.9 * settle;
    byName.shinL.rotation.x = byName.shinR.rotation.x = -1.2 * settle;
    byName.armL.rotation.x = byName.armR.rotation.x = -0.5 * settle;
    byName.tail.rotation.x = 0.4 * settle;

    s.blink = 1;                       // eyes stay shut, whatever the timer says
  }

  /* ---- The bits that run in every state -------------------------------- */

  /**
   * Blinking, on a timer rather than a cycle.
   *
   * Real eyes blink at irregular intervals, and a metronome blink is one of
   * the few things that will make an otherwise good character look mechanical.
   */
  function blinking(dt) {
    if (s.state === 'sleep') return;

    s.nextBlink -= dt;

    if (s.nextBlink <= 0) {
      s.blink = 1;
      s.nextBlink = 1.6 + Math.random() * 4.2;
    }

    s.blink = Math.max(0, s.blink - dt * 9);

    // A blink is the eye scaling shut vertically, which is the cheapest
    // convincing version — no second mesh, no texture swap.
    const open = 1 - s.blink;
    for (const eye of rig.eyes) eye.scale.y = 0.18 + open * 0.82;
  }

  /**
   * The head follows the pointer, but only within a believable cone, and only
   * when the rabbit is in a state where looking makes sense.
   */
  function heading(dt) {
    if (s.state === 'sleep') return;

    const wants = s.state === 'hop' || s.state === 'dash' ? 0 : 1;

    byName.head.rotation.y += (s.look.x * 0.5 * wants - byName.head.rotation.y) * Math.min(1, dt * 6);
    byName.head.rotation.x += (-s.look.y * 0.3 * wants - byName.head.rotation.x) * Math.min(1, dt * 6);
  }

  return { state: s, update, lookAt, scrolled, poke, stir };
}

/** Slow at both ends. The default easing for anything that travels. */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
