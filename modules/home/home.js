/**
 * home.js — page glue for index.html.
 *
 * Enhancement only. The page's structure, hero copy and category grid are all
 * real HTML. This module:
 *   - drives the hero carousel (auto-advance, pause-on-hover, arrows, dots)
 *   - fills the Premium / Best Sellers / New Arrivals product lists from
 *     catalog module (skeleton → data — product lists are inherently dynamic)
 *   - wires the rail scroll arrows and the testimonials slider
 *
 * Decision (context.md §6): product *lists* are rendered client-side because
 * catalog data is dynamic; all structural page content stays in HTML.
 */

import { getFeatured } from '../catalog/backend/api.js';
import { renderProductGrid } from '../../shared/js/components/product-card.js';
import { renderProductSkeletons } from '../../shared/js/components/skeleton-loader.js';

initHeroCarousel();
initProductSections();
initRailArrows();
initTestimonials();
initTrustMarquee();

/* ---- Hero carousel ---------------------------------------------------- */
function initHeroCarousel() {
  const viewport = document.querySelector('[data-hero]');
  if (!viewport) return;
  const slides = [...viewport.querySelectorAll('[data-hero-slide]')];
  const dots = [...document.querySelectorAll('[data-hero-dot]')];
  const prev = document.querySelector('[data-hero-prev]');
  const next = document.querySelector('[data-hero-next]');
  let index = 0;
  let timer = null;
  const INTERVAL = 6000;

  const show = (i) => {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, n) => s.classList.toggle('is-active', n === index));
    dots.forEach((d, n) => { d.classList.toggle('is-active', n === index); d.setAttribute('aria-selected', String(n === index)); });
  };
  const advance = () => show(index + 1);
  const start = () => { stop(); timer = setInterval(advance, INTERVAL); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };

  next?.addEventListener('click', () => { advance(); start(); });
  prev?.addEventListener('click', () => { show(index - 1); start(); });
  dots.forEach((d, n) => d.addEventListener('click', () => { show(n); start(); }));

  // Pause on hover / focus (a considered detail).
  viewport.closest('.hero').addEventListener('mouseenter', stop);
  viewport.closest('.hero').addEventListener('mouseleave', start);
  viewport.closest('.hero').addEventListener('focusin', stop);
  viewport.closest('.hero').addEventListener('focusout', start);
  // Pause when tab is hidden.
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  show(0);
  start();
}

/**
 * One home-page shelf: what the merchant curated, or the old tag behaviour.
 *
 * The Highlights screen in the admin panel decides the products and their
 * order. That is a separate module, and this deliberately does not import it:
 * a `fetch` that 404s is a fallback, an `import` that fails is a blank home
 * page. Deleting modules/highlights/ has to cost the curation and nothing else.
 *
 * The server already falls back to the tag when a shelf is empty, so the
 * `catch` here is for the endpoint being absent entirely.
 */
async function shelf(rail, limit) {
  try {
    const res = await fetch(`/api/highlights/${rail}`, {
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      const { data } = await res.json();
      if (Array.isArray(data) && data.length) return data.slice(0, limit);
    }
  } catch {
    // Offline, or no API. Fall through.
  }

  return getFeatured(rail, limit);
}

/* ---- Product sections (skeleton → data) ------------------------------- */
async function initProductSections() {
  const premiumRail = document.querySelector('[data-rail="premium"]');
  const newRail = document.querySelector('[data-rail="new"]');
  // Best Sellers are authored as real HTML in index.html (content-first) and
  // enhanced by main.js — we don't render them here. Only the dynamic rails load.

  if (premiumRail) renderProductSkeletons(premiumRail, 6);
  if (newRail) renderProductSkeletons(newRail, 6);

  try {
    const [premium, fresh] = await Promise.all([
      shelf('premium', 8),
      shelf('new', 8),
    ]);
    if (premiumRail) renderProductGrid(premiumRail, premium);
    if (newRail) renderProductGrid(newRail, fresh);
    // Autoplay can only be wired once there are cards to measure — the step is
    // one card's width, and an empty rail has none.
    if (premiumRail) initRailAutoplay(premiumRail);
  } catch (err) {
    console.error('[home] failed to load products', err);
    [premiumRail, newRail].forEach((el) => {
      if (el) el.innerHTML = '<p class="text-muted-gr">Couldn’t load products. Please refresh.</p>';
    });
  }
}

/* ---- Rail scroll arrows -----------------------------------------------
 *
 * A rail marked [data-rail-autoplay] owns its own arrows — it steps by exactly
 * one product and recycles cards as they leave, and a stray scrollBy() of 80%
 * of the viewport would land it between two cards with the recycler none the
 * wiser. Skipped here, wired in initRailAutoplay instead.
 */
function initRailArrows() {
  const claimed = (rail) => !rail || rail.hasAttribute('data-rail-autoplay');

  document.querySelectorAll('[data-rail-next]').forEach((btn) => {
    const rail = document.querySelector(`[data-rail="${btn.dataset.railNext}"]`);
    if (claimed(rail)) return;
    btn.addEventListener('click', () => rail.scrollBy({ left: rail.clientWidth * 0.8, behavior: 'smooth' }));
  });
  document.querySelectorAll('[data-rail-prev]').forEach((btn) => {
    const rail = document.querySelector(`[data-rail="${btn.dataset.railPrev}"]`);
    if (claimed(rail)) return;
    btn.addEventListener('click', () => rail.scrollBy({ left: -rail.clientWidth * 0.8, behavior: 'smooth' }));
  });
}

/* ---- A rail that advances itself ---------------------------------------
 *
 * Premium Picks shows one and a half cards on a phone and gives no sign the
 * other six exist: .snap-rail hides its scrollbar and the arrows live up in the
 * section header, nowhere near a thumb. So the shelf walks itself leftward, one
 * product at a time, and the motion is the affordance.
 *
 * THE LOOP IS A TREADMILL, NOT A CLONE. The obvious way to loop a scroll rail
 * is to duplicate the set and jump back a set-width when you pass it — that is
 * what initTrustMarquee does, and it is right there because the items are four
 * static headings. These are product cards: cloning them would put two Add to
 * Cart buttons, two wishlist toggles and two of every product URL in the DOM,
 * with a wired copy and an aria-hidden copy of each. So nothing is duplicated.
 * A card that has scrolled entirely off the left is moved to the end with
 * appendChild — which MOVES the node, keeping its listeners and its wishlist
 * state — and scrollLeft is reduced by the width it vacated in the same frame.
 * Everything sits exactly where it was, and the rail never runs out of runway.
 *
 * THE TRAVEL IS A rAF TWEEN, NOT scroll-behavior: smooth. The brief is 400ms
 * per product; `smooth` picks its own duration (Chrome scales it with distance,
 * Firefox has its own curve) and exposes no completion event, so the recycle
 * step would have to guess when to run. 400ms of quartic ease-out is also a
 * better curve than any browser default for this: it leaves quickly and lands
 * slowly, which is what makes a moving shelf feel weighted rather than swept.
 */
const RAIL_STEP_MS = 400;    // one product's travel — the specified figure
const RAIL_HOLD_MS = 2600;   // dwell between steps; 3s door-to-door per card
const RAIL_RESUME_MS = 4500; // quiet time before it takes over from a finger

/* Mirrors --ease-out (cubic-bezier(.16,1,.3,1)) closely enough that the CSS
   fades and the JS travel read as the same gesture, without a bezier solver. */
const easeOut = (t) => 1 - Math.pow(1 - t, 4);

function initRailAutoplay(rail) {
  if (!rail || rail.dataset.autoplayReady) return;

  // Mobile only, per the brief — but re-evaluated on rotation rather than read
  // once, so a phone turned to landscape and back behaves.
  const phone = window.matchMedia('(max-width: 767.98px)');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  rail.dataset.autoplayReady = 'true';

  const gap = () => parseFloat(getComputedStyle(rail).columnGap) || 0;
  const stepOf = (el) => (el ? el.getBoundingClientRect().width + gap() : 0);
  const maxScroll = () => rail.scrollWidth - rail.clientWidth;

  /* Two cards do not make a carousel, and worse, they make a broken one: the
     tween would be clamped at maxScroll partway through and the rail would
     stall mid-card with the recycler waiting on travel that never happened.
     Below the threshold it stays a plain swipeable rail. */
  const canLoop = () => rail.children.length >= 4 && maxScroll() >= stepOf(rail.firstElementChild) * 2;

  /* Every write to scrollLeft below happens with .is-stepping on the rail,
     which switches scroll-snap off for the duration.
     THIS IS NOT OPTIONAL. scroll-snap-type: x mandatory re-snaps after every
     programmatic scroll, so a tween that starts ON a snap point has each of its
     frames dragged straight back to it — the rail sits perfectly still for
     400ms and only the recycle at the end moves anything. That is exactly what
     the arrows did before this: card order changed, nothing animated. */
  let cancelTween = null;
  const tweenTo = (to) => new Promise((resolve) => {
    const from = rail.scrollLeft;
    const dist = to - from;
    if (Math.abs(dist) < 1) return resolve();
    let t0 = null;
    let frame = null;
    const done = () => { frame = null; cancelTween = null; resolve(); };
    // Cancelling RESOLVES rather than abandoning: whoever is awaiting this owns
    // the `busy` flag, and a promise that never settles strands it forever.
    cancelTween = () => { if (frame) cancelAnimationFrame(frame); done(); };
    const tick = (now) => {
      if (t0 === null) t0 = now;
      const p = Math.min(1, (now - t0) / RAIL_STEP_MS);
      rail.scrollLeft = from + dist * easeOut(p);
      if (p < 1) frame = requestAnimationFrame(tick);
      else done();
    };
    frame = requestAnimationFrame(tick);
  });

  const stepping = async (run) => {
    rail.classList.add('is-stepping');
    try { await run(); } finally { rail.classList.remove('is-stepping'); }
  };

  /* Send every card that is now fully behind the left edge to the back of the
     queue, paying back its width so the view does not jump. Bounded by the
     child count: a zero-width card (an image that failed to lay out) would
     otherwise spin this forever. */
  const recycle = () => {
    for (let guard = rail.children.length; guard > 0; guard--) {
      const first = rail.firstElementChild;
      const w = stepOf(first);
      if (!first || w < 1 || rail.scrollLeft < w - 1) break;
      rail.appendChild(first);
      rail.scrollLeft -= w;
    }
  };

  const forward = () => stepping(async () => {
    if (!canLoop()) return;
    await tweenTo(Math.min(rail.scrollLeft + stepOf(rail.firstElementChild), maxScroll()));
    recycle();
  });

  /* Backwards has to borrow before it spends: the card that should slide in
     from the left is currently at the end, so it is moved to the front and paid
     for up front, then the rail travels back over it. */
  const backward = () => stepping(async () => {
    if (!canLoop()) return;
    const last = rail.lastElementChild;
    const w = stepOf(last);
    if (w < 1) return;
    rail.insertBefore(last, rail.firstElementChild);
    rail.scrollLeft += w;
    await tweenTo(Math.max(0, rail.scrollLeft - w));
  });

  /* ---- Scheduling ---- */
  let timer = null;
  let busy = false;
  let hovered = false;
  let touched = false;
  let inView = true;
  let resumeTimer = null;

  const active = () => phone.matches && !still.matches;
  const canPlay = () => active() && inView && !hovered && !touched && !document.hidden && canLoop();

  const stop = () => { clearTimeout(timer); timer = null; };
  const schedule = () => {
    stop();
    if (canPlay()) timer = setTimeout(step, RAIL_HOLD_MS);
  };
  const step = async () => {
    if (busy || !canPlay()) return schedule();
    busy = true;
    await forward();
    busy = false;
    schedule();
  };

  /* A finger takes precedence and keeps it for a few seconds after letting go —
     a shelf that starts moving again the instant you stop dragging is a shelf
     that is arguing with you. */
  const hold = () => {
    touched = true;
    stop();
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(async () => {
      touched = false;
      /* Re-align to a card edge before taking over. A swipe ends wherever the
         finger left it, and without this the treadmill inherits that half-card
         offset and carries it for the rest of the session — every subsequent
         step lands a fixed few pixels wrong. */
      await stepping(async () => {
        recycle();
        const w = stepOf(rail.firstElementChild);
        if (w < 1 || rail.scrollLeft <= 0.5) return;
        await tweenTo(rail.scrollLeft > w / 2 ? Math.min(w, maxScroll()) : 0);
        recycle();
      });
      schedule();
    }, RAIL_RESUME_MS);
  };

  /* A gesture also stops whatever is mid-flight — a tween still writing
     scrollLeft under a moving finger is the rail fighting the user. */
  const handoff = () => { cancelTween?.(); hold(); };

  ['pointerdown', 'touchstart', 'wheel'].forEach((evt) =>
    rail.addEventListener(evt, handoff, { passive: true }));

  // Hover/focus pause is for the pointer case only — on touch, :hover latches
  // and would freeze the rail permanently after one tap.
  if (window.matchMedia('(hover: hover)').matches) {
    rail.addEventListener('pointerenter', () => { hovered = true; schedule(); });
    rail.addEventListener('pointerleave', () => { hovered = false; schedule(); });
  }
  rail.addEventListener('focusin', () => { hovered = true; schedule(); });
  rail.addEventListener('focusout', () => { hovered = false; schedule(); });

  document.addEventListener('visibilitychange', schedule);
  phone.addEventListener('change', schedule);
  still.addEventListener('change', schedule);
  window.addEventListener('resize', schedule);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; schedule(); },
      { threshold: 0.35 }).observe(rail);
  }

  /* The arrows initRailArrows deliberately left alone. They drive the same two
     functions, so a tap and an autoplay tick are the same 400ms movement — and
     tapping one hands control over exactly as a swipe does.
     hold(), not handoff(): a tap is a request for one more step, not an
     interruption of the one in flight, so the current tween is left to land. */
  const arrow = (sel, run) => document.querySelector(sel)?.addEventListener('click', async () => {
    hold();
    if (busy) return;
    busy = true;
    await run();
    busy = false;
  });
  arrow(`[data-rail-next="${rail.dataset.rail}"]`, forward);
  arrow(`[data-rail-prev="${rail.dataset.rail}"]`, backward);

  schedule();
}

/* ---- Trust marquee (phones) -------------------------------------------
 *
 * Below 768px the four trust claims are laid out as one travelling row
 * (modules/home/home.css). CSS can do the layout and the loop; it cannot do
 * the two things below.
 *
 *   1. THE CLONE. A seamless loop needs the set present twice — the track
 *      translates by exactly -50% and the second copy is already where the
 *      first one was. Writing that duplicate into index.html would ship four
 *      extra headings to every screen reader, crawler and Reader Mode on every
 *      screen size, to serve a phone-only visual. So it's cloned here, marked
 *      aria-hidden, and hidden outright above 768px.
 *
 *   2. THE COUPLING TO SCROLL. The band drifts by itself, and any vertical
 *      scrolling — up OR down — surges it leftward, then it eases back to the
 *      drift over about a second. Direction is ignored on purpose: this is a
 *      ribbon that reacts to the page being read, not a scrubber that runs
 *      backwards when you go back up. Reading down the page and flicking back
 *      to the hero should both feel like they push it along.
 *
 * Speed is changed via the Web Animations API rather than by rewriting
 * `animation-duration`: swapping the duration on a running CSS animation
 * re-maps its progress and the row jumps sideways. playbackRate leaves the
 * current position alone and only changes how fast it advances from here.
 */
function initTrustMarquee() {
  const marquee = document.querySelector('[data-trust-marquee]');
  const track = marquee?.querySelector('[data-trust-track]');
  if (!track) return;
  // No loop at all under reduced motion — the CSS falls back to a swipeable
  // row, and without the clones there is nothing extra to swipe past.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* scroll-reveal observes each of the four items individually. Once the row is
     a clipping track, items three and four are outside it at load and an
     IntersectionObserver reports anything clipped by an ancestor as not
     intersecting — so they never got .is-visible and looped past at opacity 0.
     On phones the band's own travel is the entrance; take the per-item reveal
     off it and let the desktop grid keep its stagger. */
  const phone = window.matchMedia('(max-width: 767.98px)');
  const originals = [...track.children];
  const settle = () => {
    if (phone.matches) originals.forEach((el) => el.classList.add('is-visible'));
  };
  settle();
  phone.addEventListener('change', settle);

  originals.forEach((item) => {
    const clone = item.cloneNode(true);
    clone.classList.add('trust-marquee__clone');
    clone.setAttribute('aria-hidden', 'true');
    // Decoration must not wait on the reveal observer — that only ever fires
    // for the elements it was handed, so a clone carrying [data-reveal] would
    // stay at opacity 0 forever and the loop would show four blanks.
    clone.removeAttribute('data-reveal');
    clone.style.removeProperty('--reveal-delay');
    track.appendChild(clone);
  });
  marquee.classList.add('is-looping');

  const DRIFT = 1;      // resting rate: ~23px/s, slow enough to read at a glance
  const MAX = 9;        // ceiling on a hard fling
  const GAIN = 0.5;     // multiples of DRIFT per px scrolled in one frame
  const DECAY = 0.9;    // per frame, back toward DRIFT

  let anim = null;
  let rate = DRIFT;
  let lastY = window.scrollY;
  let frame = null;

  /* Re-resolved rather than cached once: the animation does not exist above
     768px, so on a phone rotated to landscape or a resized desktop window this
     picks it up whenever the media query starts applying. */
  const running = () => {
    if (!anim || anim.playState === 'idle') {
      const found = track.getAnimations();
      anim = found.find((a) => a.animationName === 'trust-marquee') || found[0] || null;
    }
    return anim;
  };

  const setRate = (r) => {
    const a = running();
    if (!a) return;
    if (typeof a.updatePlaybackRate === 'function') a.updatePlaybackRate(r);
    else a.playbackRate = r;
  };

  const ease = () => {
    rate = DRIFT + (rate - DRIFT) * DECAY;
    if (rate - DRIFT > 0.02) {
      setRate(rate);
      frame = requestAnimationFrame(ease);
    } else {
      rate = DRIFT;
      setRate(DRIFT);
      frame = null;          // idle again — no rAF loop ticking for nothing
    }
  };

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const delta = Math.abs(y - lastY);
    lastY = y;
    if (delta < 1) return;
    // max(): a fast flick shouldn't be damped by the frame that follows it.
    rate = Math.min(MAX, Math.max(rate, DRIFT + delta * GAIN));
    setRate(rate);
    if (!frame) frame = requestAnimationFrame(ease);
  }, { passive: true });

  // Don't animate a band nobody can see — it is offscreen for most of the page,
  // and for the whole of a backgrounded tab. `inView` is kept so returning to
  // the tab can resume it; the observer will not fire again on its own.
  let inView = true;
  const sync = () => {
    const a = running();
    if (!a) return;
    if (inView && !document.hidden) a.play();
    else a.pause();
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); },
      { threshold: 0 }).observe(marquee);
  }
  document.addEventListener('visibilitychange', sync);
}

/* ---- Testimonials slider ---------------------------------------------- */
function initTestimonials() {
  const track = document.querySelector('[data-testi-track]');
  if (!track) return;
  const cards = [...track.children];
  const prev = document.querySelector('[data-testi-prev]');
  const next = document.querySelector('[data-testi-next]');
  let i = 0;
  const go = (n) => { i = (n + cards.length) % cards.length; cards[i].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); };
  next?.addEventListener('click', () => go(i + 1));
  prev?.addEventListener('click', () => go(i - 1));
}
