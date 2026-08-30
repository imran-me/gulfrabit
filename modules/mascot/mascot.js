/**
 * mascot.js — the GulfRabit rabbit, hopping along the foot of the shop.
 *
 * THE COST, STATED PLAINLY
 * ------------------------
 * three.js is 264KB gzipped. That is not a rounding error on a shop whose
 * customers are on cheap Android phones and metered mobile data in a market
 * where cash on delivery exists because cards are not universal. A mascot that
 * slows the catalogue is a mascot that costs sales, and no amount of charm
 * pays that back.
 *
 * So it is gated, hard, and the gate is the most important code in this file:
 *
 *   · Never in the funnel. Cart, checkout and express are excluded outright.
 *     The one job of those pages is to take money, and a rabbit hopping past
 *     the Place Order button is a distraction at the exact moment attention is
 *     worth the most.
 *   · Never against the visitor's wishes: prefers-reduced-motion and
 *     Save-Data both refuse it, and once refused it is never fetched.
 *   · Never on a device that will struggle: fewer than 4 cores or under 4GB
 *     of reported memory and it does not load.
 *   · Never before the page is done. It waits for `load`, then for an idle
 *     callback, so it is competing with nothing.
 *   · Never while unseen. The loop stops on a hidden tab and when the canvas
 *     is scrolled out of view.
 *
 * Everything above means the customers who can least afford this feature never
 * pay for it, and the ones on a good phone and good wifi get the whole thing.
 *
 * THE MODULE TEST
 * ---------------
 * Delete modules/mascot/ and the line in tools/assemble.py, and the shop is
 * exactly as it was. Nothing else in the project imports from here.
 */

/** Pages where the rabbit is simply not welcome. */
const OFF_LIMITS = ['/cart', '/checkout', '/express', '/admin', '/order-confirmation'];

const MIN_CORES = 4;
const MIN_MEMORY_GB = 4;
/** Below this the strip would be taller than the content it sits under. */
const MIN_VIEWPORT = 480;

boot();

async function boot() {
  if (!wanted()) return;

  // After everything else. `load` rather than DOMContentLoaded because images
  // are what actually make a catalogue page slow, and this must be behind them.
  await afterLoad();
  await idle();

  // Re-checked: a visitor can turn on reduced motion, or the tab can be
  // hidden, in the seconds between the gate above and here.
  if (!wanted()) return;

  let THREE;
  try {
    THREE = await import('./vendor/three.module.js');
  } catch {
    return;                    // no rabbit, no error, no broken page
  }

  const { createRabbit } = await import('./rabbit.js');
  const { createBrain } = await import('./brain.js');

  await start(THREE, createRabbit, createBrain);
}

/**
 * Should this visitor, on this page, on this device, get a rabbit at all?
 *
 * Every clause is a reason to say no, and saying no is free.
 */
function wanted() {
  // Motion the visitor has explicitly asked not to see. This is the one check
  // that is not a performance judgement — it is an accessibility instruction,
  // and a hopping animal is exactly what it is about.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;

  const path = location.pathname;
  if (OFF_LIMITS.some((p) => path.startsWith(p) || path.includes(p))) return false;

  // The visitor is paying for this by the megabyte and has said so.
  if (navigator.connection?.saveData) return false;

  // 2g / slow-2g. A 264KB download on a connection like that is not a
  // background nicety, it is contention with the product images.
  const type = navigator.connection?.effectiveType;
  if (type === '2g' || type === 'slow-2g') return false;

  if ((navigator.hardwareConcurrency ?? 8) < MIN_CORES) return false;
  if ((navigator.deviceMemory ?? 8) < MIN_MEMORY_GB) return false;

  if (Math.min(window.innerWidth, window.innerHeight) < MIN_VIEWPORT) return false;

  // No WebGL, no rabbit — and asking costs one throwaway context.
  try {
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) return false;
  } catch {
    return false;
  }

  return true;
}

const afterLoad = () => (document.readyState === 'complete'
  ? Promise.resolve()
  : new Promise((r) => window.addEventListener('load', r, { once: true })));

const idle = () => new Promise((r) => (window.requestIdleCallback
  ? requestIdleCallback(r, { timeout: 2500 })
  : setTimeout(r, 1200)));

/* ------------------------------------------------------------------ *
 * The scene
 * ------------------------------------------------------------------ */

async function start(THREE, createRabbit, createBrain) {
  /* The stylesheet arrives with the module, not with the page.
     Most visitors never get this far — the gate above turns the majority away
     — so putting mascot.css in every page's <head> would be a request and a
     parse spent on a strip that will not exist. Injecting it here also keeps
     the module genuinely self-contained: delete modules/mascot/ and there is
     no dangling <link> anywhere to clean up.
     Awaited, so the canvas is never painted before the rules that position
     it — otherwise a full-page canvas flashes across the shop for one frame. */
  await styles();

  const host = document.createElement('div');
  host.className = 'mascot';
  // Decorative. It is announced to nobody and reachable by nothing: a screen
  // reader user gets no benefit from a rabbit and a keyboard user must not be
  // able to tab into a canvas that does nothing.
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  // Capped at 2. A 3x phone screen renders nine times the pixels of a 1x one
  // for a difference nobody can see on a 90px-tall strip.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();

  /* An orthographic camera, not a perspective one. The rabbit travels the full
     width of a very wide, very short strip, and under perspective it would
     stretch and lean as it approached either end — which on a character built
     from flat plates looks like a rendering fault rather than a lens. */
  const camera = new THREE.OrthographicCamera(-3, 3, 1.6, -0.4, 0.1, 40);
  camera.position.set(0, 1.1, 8);
  camera.lookAt(0, 0.75, 0);

  /* ---- Light -----------------------------------------------------------
     Three lamps, which is the fewest that will show a faceted character
     properly: a sky/ground fill so no plate is ever black, a key from the
     front-left to carve the facets apart, and a cyan rim from behind to pick
     the silhouette off a white page. The rim is what stops the rabbit
     disappearing into the background on a bright catalogue. */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfe9f5, 1.35));

  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-2.4, 4.2, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = -3.4;
  key.shadow.camera.right = 3.4;
  key.shadow.camera.top = 2.4;
  key.shadow.camera.bottom = -1;
  key.shadow.radius = 3;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x36c8ea, 1.1);
  rim.position.set(2.6, 1.6, -3);
  scene.add(rim);

  /* The floor exists only to catch a shadow. ShadowMaterial draws nothing but
     the shadow itself, so the page shows through everywhere else and there is
     no grey rectangle sitting across the bottom of the shop. */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 6),
    new THREE.ShadowMaterial({ opacity: 0.16 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const rig = createRabbit(THREE);
  scene.add(rig.group);

  const brain = createBrain(rig, { bounds: 2.4 });

  /* ---- Fitting the strip to the window -------------------------------- */

  function resize() {
    const w = window.innerWidth;
    const h = Math.round(Math.min(190, Math.max(120, w * 0.14)));

    renderer.setSize(w, h, false);
    host.style.height = `${h}px`;

    // The camera frames a fixed HEIGHT of world and as much width as the
    // window happens to be, so the rabbit is the same size on every screen and
    // simply has more room to roam on a wide one.
    const worldHeight = 2.0;
    const half = (worldHeight * (w / h)) / 2;
    camera.left = -half;
    camera.right = half;
    camera.top = worldHeight * 0.8;
    camera.bottom = -worldHeight * 0.2;
    camera.updateProjectionMatrix();

    // Keep it on screen, less a margin so it never hops half out of frame.
    brain.state.bounds = Math.max(1, half - 0.6);
  }

  resize();
  window.addEventListener('resize', debounce(resize, 150));

  /* ---- What the rabbit can notice ------------------------------------- */

  window.addEventListener('pointermove', (e) => {
    // Normalised against the WINDOW, not the canvas: the rabbit should look up
    // at a pointer anywhere on the page, which is most of the charm.
    brain.lookAt(
      (e.clientX / window.innerWidth) * 2 - 1,
      (e.clientY / window.innerHeight) * 2 - 1,
    );
  }, { passive: true });

  let lastScroll = window.scrollY;
  let lastScrollAt = performance.now();
  window.addEventListener('scroll', () => {
    const now = performance.now();
    const dt = Math.max(16, now - lastScrollAt);
    const speed = Math.abs(window.scrollY - lastScroll) / dt;
    lastScroll = window.scrollY;
    lastScrollAt = now;
    brain.scrolled(speed);
  }, { passive: true });

  // The canvas takes no pointer events — see mascot.css — so the click has to
  // be caught on the window and tested against where the rabbit actually is.
  // A mascot that eats clicks meant for a product card is a bug, not a toy.
  window.addEventListener('pointerdown', (e) => {
    const box = host.getBoundingClientRect();
    if (e.clientY < box.top) return;

    const half = camera.right;
    const rabbitPx = ((brain.state.x + half) / (half * 2)) * window.innerWidth;
    if (Math.abs(e.clientX - rabbitPx) < 70) brain.poke();
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    // A hidden tab renders nothing. Without this the loop keeps a phone's GPU
    // awake in a background tab, which is a battery complaint waiting to
    // happen and is invisible to whoever wrote it.
    if (document.visibilityState === 'visible') { clock = performance.now(); loop(); }
  });

  /* Off-screen is the other half of the same idea: the strip is at the foot of
     the viewport, and on a long catalogue it is out of sight most of the time. */
  let onScreen = true;
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) { clock = performance.now(); loop(); }
  }).observe(host);

  /* ---- The loop -------------------------------------------------------- */

  let clock = performance.now();
  let running = false;

  function loop() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function frame(now) {
    running = false;

    if (document.visibilityState !== 'visible' || !onScreen) return;

    // Clamped. A tab restored after ten minutes would otherwise deliver a
    // 600-second delta and fire the rabbit across the world in one frame.
    const dt = Math.min(0.05, (now - clock) / 1000);
    clock = now;

    brain.update(dt, now / 1000);

    rig.group.position.x = brain.state.x;
    rig.group.position.y = brain.state.y;
    // Turned rather than mirrored: negative scale flips the winding order and
    // every face on the animal would light from the wrong side.
    rig.group.rotation.y += (
      (brain.state.facing > 0 ? 0.45 : -0.45) - rig.group.rotation.y
    ) * Math.min(1, dt * 5);

    renderer.render(scene, camera);
    loop();
  }

  loop();
}

/**
 * Load the module's own stylesheet, and resolve either way.
 *
 * A rejected stylesheet must not stop the rabbit: the positioning would be
 * wrong, but silently rendering nothing because a CSS file 404'd would be a
 * worse failure and a much harder one to find. `import.meta.url` rather than
 * an absolute path, so the folder can be moved without editing this line.
 */
function styles() {
  const href = new URL('./mascot.css', import.meta.url).href;
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();

  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    document.head.append(link);
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
