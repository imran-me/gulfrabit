/**
 * noor-physics.js — a small integrator for the things in Noor's sky whose
 * motion is genuinely a force problem.
 *
 * WHY THIS EXISTS WHEN THE SKY ALREADY MOVED
 * ------------------------------------------
 * Everything in theme-noor-sky.css is physics-SHAPED: the fish arc is a
 * parabola I sampled by hand, the bubble accelerates because I chose an
 * ease-in, the spark cools because I staggered two opacity curves. It looks
 * right, it costs nothing, and it runs on the compositor.
 *
 * But authored motion cannot be INTERRUPTED, and that is its ceiling. A gust
 * cannot deflect a fish that is already committed to a keyframe; it can only
 * lean it sideways and let it snap back. Two sparks off the same fire cannot
 * drift apart because one is hotter. A bubble cannot speed up because it grew,
 * because in a keyframe the growing and the speeding are two curves I drew to
 * agree rather than one fact with two consequences.
 *
 * So the bodies below are integrated instead of animated. Their paths are not
 * described anywhere — they fall out of gravity, buoyancy, drag and a shared
 * wind field, which means the fish really does get blown off its arc and the
 * spark really does sink once it has cooled.
 *
 * WHAT IS *NOT* HERE, AND WHY THAT IS THE DESIGN
 * ----------------------------------------------
 * Meteors, satellites, comets, birds, clouds, airglow and every star effect
 * stay on the compositor where they were. Not out of caution — because
 * integrating them would be a lie dressed as rigour:
 *
 *   - A meteor's path is a straight line at constant speed. Simulating that
 *     is arithmetic with extra steps and a main-thread cost.
 *   - A satellite in orbit is in FREE FALL. Applying this file's gravity to
 *     one would pull it out of the sky.
 *   - A bird's gait is behavioural, not ballistic. A gull banks because it
 *     decided to; there is no force to integrate, and a physically simulated
 *     bird is the most reliable way to get an unconvincing bird.
 *
 * The rule: simulate a body when a force acting on it should visibly change
 * where it ends up. Otherwise animate it and spend nothing.
 *
 * THE COST, STATED PLAINLY
 * ------------------------
 * One rAF loop, at most MAX_BODIES live, roughly twenty flops and one style
 * write each per step. It writes `transform` and `opacity` only — no layout
 * property. It does read `innerWidth`/`innerHeight` in the off-screen test,
 * which are cached viewport metrics rather than element geometry and so do
 * not force a reflow the way `offsetTop` or `getBoundingClientRect` would.
 * The loop does not exist when nothing is simulated: the last body to
 * die cancels it. It stops on tab-hide, on reduced motion, and on leaving
 * Noor. A storefront must not pay for weather it is not showing.
 */

/* ---- the world ---------------------------------------------------------- */

/**
 * A FIXED timestep, and the accumulator that makes it fixed.
 *
 * This is not ceremony. With quadratic drag, integrating at whatever interval
 * rAF happens to fire makes the result depend on the monitor: the same spark
 * reaches a different height at 144Hz than at 60Hz, and a tab that stalls for
 * 300ms teleports every body across the page in one enormous step. Stepping a
 * constant 1/120s and carrying the remainder means the sky behaves the same
 * everywhere, and a stall costs a few extra steps rather than a catastrophe.
 */
const STEP = 1 / 120;

/** A stall longer than this is DISCARDED rather than simulated. Coming back
 *  to a tab should not replay the four seconds of physics you missed. */
const MAX_CATCHUP = 0.25;

/** The ceiling. Well above what the conductor's own caps allow — this is the
 *  backstop for a bug, not the working limit. */
const MAX_BODIES = 90;

/**
 * The wind. ONE vector, read by every body in the same step, and that shared
 * reading is the whole reason this file earns its cost: correlated motion is
 * precisely what per-element keyframes cannot produce. When the gust crosses,
 * every spark and every bubble bends the same way at the same moment, by an
 * amount that depends on how much drag each one has — so the small ones are
 * flung and the heavy ones barely notice, without anyone deciding that.
 */
const wind = { x: 0, y: 0, tx: 0, ty: 0 };

/** Live bodies. Compacted in place; never re-allocated per frame. */
const bodies = [];

let raf = 0;
let last = 0;
let acc = 0;

/* ---- the public surface ------------------------------------------------- */

/**
 * Hand a node to the simulation.
 *
 * The node must be `position: fixed; left: 0; top: 0` — the engine owns its
 * transform outright and writes absolute viewport pixels into it. Anchoring
 * with CSS `left`/`bottom` as well would mean two systems each believing they
 * decide where the element is.
 *
 * @param {HTMLElement} node
 * @param {object} b initial state and coefficients:
 *   x, y        viewport px
 *   vx, vy      px/s (y is DOWN, as everywhere else on a screen)
 *   g           gravity, px/s^2
 *   drag        quadratic coefficient over mass; bigger = lighter/fluffier
 *   lift        buoyancy as a fraction of g, scaled by `heat` if present
 *   heat        1..0; decays at `cool` per second. Drives lift and opacity.
 *   cool        heat lost per second
 *   air         false for a body below the waterline — the wind cannot reach it
 *   grow        fractional size gain per second (a bubble rising)
 *   spin        deg/s
 *   aim         true = rotate to face the velocity vector
 *   life        seconds before it dies regardless
 *   fade        seconds of fade-out at the end of life
 *   scale       initial scale
 *   onStep      optional (body) => void, for anything the engine cannot know
 *   onDeath     optional (body) => void, called once, before removal
 */
export function addBody(node, b) {
  if (bodies.length >= MAX_BODIES) { node.remove(); return null; }

  const body = {
    node,
    x: b.x, y: b.y,
    vx: b.vx ?? 0, vy: b.vy ?? 0,
    g: b.g ?? 0,
    drag: b.drag ?? 0.002,
    lift: b.lift ?? 0,
    heat: b.heat ?? 0,
    cool: b.cool ?? 0,
    grow: b.grow ?? 0,
    // Which medium this body is in. false = below the waterline, where the
    // sky's wind does not reach.
    air: b.air !== false,
    spin: b.spin ?? 0,
    aim: b.aim ?? false,
    rot: b.rot ?? 0,
    scale: b.scale ?? 1,
    life: b.life ?? 8,
    fade: b.fade ?? 0.6,
    age: 0,
    alpha: b.alpha ?? 1,
    base: b.alpha ?? 1,
    onStep: b.onStep ?? null,
    onDeath: b.onDeath ?? null,
    dead: false,
  };

  bodies.push(body);
  draw(body);              // place it before its first frame, or it flashes at 0,0
  wake();
  return body;
}

/**
 * Blow. The gust calls this; the wind eases toward the target and back to
 * still on its own, so nothing has to remember to turn it off.
 *
 * @param {number} vx px/s — the air's velocity, not a force
 * @param {number} ms how long before it starts dying away
 */
export function setWind(vx, ms) {
  wind.tx = vx;
  wake();
  setTimeout(() => { wind.tx = 0; }, ms);
}

/** Everything stops and leaves. Called when the theme changes or the sky is
 *  torn down; the nodes themselves are swept by theme.js's [data-noor-fx]. */
export function stopPhysics() {
  for (const b of bodies) b.dead = true;
  bodies.length = 0;
  wind.x = wind.y = wind.tx = wind.ty = 0;
  cancelAnimationFrame(raf);
  raf = 0;
}

/** How many bodies are live — the conductor uses this to stop over-spawning. */
export const bodyCount = () => bodies.length;

/* ---- the loop ----------------------------------------------------------- */

function wake() {
  if (raf || !bodies.length) return;
  last = performance.now();
  acc = 0;
  raf = requestAnimationFrame(frame);
}

function frame(now) {
  raf = 0;

  // Seconds, clamped. A backgrounded tab hands back an enormous delta and
  // simulating it would fling every body off the page at once.
  const dt = Math.min((now - last) / 1000, MAX_CATCHUP);
  last = now;
  acc += dt;

  while (acc >= STEP) {
    step(STEP);
    acc -= STEP;
  }

  for (const b of bodies) if (!b.dead) draw(b);

  // Compact in place. Splicing inside the integration loop would renumber the
  // array underneath it and silently skip the body after each death.
  let w = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.dead) {
      b.onDeath?.(b);
      b.node.remove();
    } else {
      bodies[w++] = b;
    }
  }
  bodies.length = w;

  // The last body out turns off the lights. No idle rAF, ever.
  if (bodies.length && !document.hidden) {
    raf = requestAnimationFrame(frame);
  }
}

/**
 * One fixed step. Semi-implicit Euler: velocity is updated first and the
 * position is then advanced with the NEW velocity. Explicit Euler — position
 * first — leaks energy into a drag system and lets a lightly damped body
 * accelerate forever; this variant is stable at this timestep for everything
 * in the file, and it is one line's difference.
 */
function step(dt) {
  // The wind eases rather than switching, because air has mass too — a gust
  // that arrives instantly reads as the page glitching.
  wind.x += (wind.tx - wind.x) * Math.min(1, dt * 2.2);
  wind.y += (wind.ty - wind.y) * Math.min(1, dt * 2.2);

  for (const b of bodies) {
    if (b.dead) continue;

    b.age += dt;
    if (b.heat > 0) b.heat = Math.max(0, b.heat - b.cool * dt);

    /* Drag is measured against the MEDIUM, not against the ground. That single
       choice is what makes wind work: a body sitting still in moving air has
       a relative velocity, so drag pushes it downwind, and a body already
       moving downwind feels almost nothing. Wind and drag are not two forces
       here — they are one term, which is also what they are in reality.
       A body flagged `air: false` is in a different medium and the wind is
       simply not part of its world. That is the bubble: it is under the
       water, and a gust crossing the lagoon does not reach it. Letting the
       shared wind vector touch everything would have blown it sideways
       through the sea. */
    const rx = b.vx - (b.air ? wind.x : 0);
    const ry = b.vy - (b.air ? wind.y : 0);

    /* Quadratic, because everything here is well above the Reynolds number
       where drag stops being proportional to speed. It is also what gives a
       terminal velocity for free: a falling body settles at sqrt(g/drag)
       without anyone writing a limit. */
    const speed = Math.hypot(rx, ry) || 0.0001;
    const k = b.drag * speed;

    b.vx += (-k * rx) * dt;
    b.vy += (-k * ry + b.g * (1 - b.lift * b.heat)) * dt;

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.grow) b.scale += b.scale * b.grow * dt;
    if (b.spin) b.rot += b.spin * dt;
    /* A body in free flight points along its velocity — that is not a
       stylistic choice, it is what "aerodynamically stable" means. Computing
       it from the actual velocity is also strictly better than the keyframe
       version it replaces, which approximated the same angle at eight sampled
       instants and could not know about the wind. */
    if (b.aim) b.rot = (Math.atan2(b.vy, b.vx) * 180) / Math.PI;

    b.onStep?.(b, dt);

    const left = b.life - b.age;
    b.alpha = left < b.fade ? b.base * Math.max(0, left / b.fade) : b.base;
    if (b.heat > 0 && b.cool > 0) b.alpha *= 0.45 + 0.55 * b.heat;

    // Dead: out of time, or far enough outside the viewport that nobody will
    // see it come back. The margin is generous because wind can carry a body
    // out and return it.
    if (b.age >= b.life ||
        b.y > innerHeight + 400 || b.y < -600 ||
        b.x < -500 || b.x > innerWidth + 500) {
      b.dead = true;
    }
  }
}

/** The only write. transform and opacity — nothing that can cost a layout. */
function draw(b) {
  b.node.style.transform =
    `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0)` +
    (b.rot ? ` rotate(${b.rot.toFixed(1)}deg)` : '') +
    (b.scale !== 1 ? ` scale(${b.scale.toFixed(3)})` : '');
  b.node.style.opacity = b.alpha.toFixed(3);
}

/* A hidden tab stops the clock. Without this the accumulator is not the
   problem — rAF already pauses — but the wind's setTimeout is not paused, so
   a tab restored after a minute would resume mid-gust with a stale target. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
  } else {
    wake();
  }
});
