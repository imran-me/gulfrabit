/**
 * marquee.js — a row that travels right-to-left, for ever.
 *
 * Lifted out of home.js, where it was the trust band's private machinery, when
 * the panel gained the power to put four other sections into the same shape.
 * One implementation, because the interesting parts took several passes to get
 * right and nobody should have to get them right twice:
 *
 *   THE TRACK IS COPIED UNTIL IT OUTRUNS ITS FRAME, then translated by exactly
 *   one copy. Two copies and -50% is the textbook version and it is only right
 *   when one copy is already wider than the frame. Measured in a real browser
 *   at 1440px: the trust strip's four chips are 631px inside a 1336px band, so
 *   the -50% version swept a 705px hole through the loop once a cycle, and the
 *   category tiles a 312px one. Both on the desktop side of a setting whose
 *   whole point is that the two sides differ.
 *
 *   So the copy count is computed from measurement — ceil(frame / copy) + 1,
 *   which guarantees the copies BEHIND the travel still cover the frame — and
 *   the shift is handed to the keyframes as --gr-marquee-shift. The distance
 *   travelled is always exactly one copy, so speed does not change with the
 *   count: the duration in the stylesheet still means what it says.
 *
 *   Spacing therefore has to live on the ITEM as a trailing margin, never as
 *   the flex `gap`: n items give n-1 gaps, so with `gap` the copy boundary
 *   lands short of a full copy and the loop hitches. Every stylesheet that
 *   opts a section into this must follow that rule — see home.css.
 *
 *   THE CLONES ARE NOT CONTENT. aria-hidden, and stripped of [data-reveal]:
 *   scroll-reveal only ever fires for the elements it was handed, so a clone
 *   carrying that attribute stays at opacity 0 for ever and the loop shows a
 *   row of blanks.
 *
 *   THE ORIGINALS ARE FORCED VISIBLE. Once the row is a clipping track,
 *   anything past the viewport is reported as not-intersecting by an
 *   IntersectionObserver, so items three and four never received .is-visible
 *   and looped past invisible. In a moving row the travel IS the entrance.
 *
 *   SPEED IS CHANGED VIA THE WEB ANIMATIONS API, never by rewriting
 *   animation-duration: swapping the duration on a running CSS animation
 *   re-maps its progress and the row jumps sideways. playbackRate leaves the
 *   position alone and only changes how fast it advances from here.
 *
 * The row also SURGES WHILE THE PAGE IS SCROLLED, up or down alike, and eases
 * back to its resting drift over about a second. Direction is ignored on
 * purpose: this is a ribbon that reacts to the page being read, not a scrubber
 * that runs backwards when you go back up.
 */

const DRIFT = 1;      // resting rate: slow enough to read at a glance
const MAX = 9;        // ceiling on a hard fling
const GAIN = 0.5;     // multiples of DRIFT per px scrolled in one frame
const DECAY = 0.9;    // per frame, back toward DRIFT

export const CLONE_CLASS = 'is-marquee-clone';

/**
 * @param {Element} viewport  the clipping box; gets .is-looping
 * @param {Element} track     the row that is animated; its children are cloned
 * @param {{name?: string, onClone?: (el: Element) => void}} [opts]
 *        `name` is the @keyframes name, used to pick this animation out when an
 *        element carries more than one. `onClone` is for a section whose
 *        stylesheet needs its own hook on the copies.
 * @returns {{mount: () => void, unmount: () => void, mounted: () => boolean}}
 */
export function createMarquee(viewport, track, { name = 'gr-marquee', onClone } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /* Above this the DOM cost stops being worth it. Six copies covers a frame
     six times its content; a section that thin is a section with nothing in
     it, and looping one is not a layout problem this can solve. */
  const MAX_COPIES = 6;

  let on = false;
  let copies = 2;
  let copyW = 0;
  let anim = null;
  let rate = DRIFT;
  let lastY = window.scrollY;
  let frame = null;
  let io = null;
  let inView = true;

  /* Re-resolved rather than cached once: a section can be looping at one width
     and not at another, so the animation may not exist yet — or may be a new
     one after a resize. */
  const running = () => {
    if (!anim || anim.playState === 'idle') {
      const found = track.getAnimations();
      anim = found.find((a) => a.animationName === name) || found[0] || null;
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

  const onScroll = () => {
    const y = window.scrollY;
    const delta = Math.abs(y - lastY);
    lastY = y;
    if (delta < 1) return;
    // max(): a fast flick shouldn't be damped by the frame that follows it.
    rate = Math.min(MAX, Math.max(rate, DRIFT + delta * GAIN));
    setRate(rate);
    if (!frame) frame = requestAnimationFrame(ease);
  };

  // Don't animate a band nobody can see — it is offscreen for most of the page,
  // and for the whole of a backgrounded tab.
  const sync = () => {
    const a = running();
    if (!a) return;
    if (inView && !document.hidden) a.play();
    else a.pause();
  };

  function mount() {
    if (on) return;
    // No loop at all under reduced motion. The stylesheet falls back to a
    // swipeable row, and without the clones there is nothing extra to swipe.
    if (reduced.matches) return;
    on = true;

    const originals = [...track.children];
    originals.forEach((item) => item.classList.add('is-visible'));

    /* Measured BEFORE anything is cloned, so this is the width of one copy.
       The track is already `width: max-content` by then — that comes from the
       [data-lay] rule, which is stamped before the first paint, not from
       .is-looping, which is added below. */
    copyW = Math.max(1, track.scrollWidth);
    copies = Math.min(MAX_COPIES, Math.max(2, Math.ceil(viewport.clientWidth / copyW) + 1));

    for (let copy = 1; copy < copies; copy++) {
      originals.forEach((item) => {
        const clone = item.cloneNode(true);
        clone.classList.add(CLONE_CLASS);
        clone.setAttribute('aria-hidden', 'true');
        clone.removeAttribute('data-reveal');
        clone.style.removeProperty('--reveal-delay');
        // Nothing inside a clone is reachable, so nothing inside it may be
        // focusable — otherwise tabbing walks into a copy of the row that a
        // screen reader has been told is not there.
        clone.querySelectorAll('a, button, input, select, textarea, [tabindex]')
          .forEach((el) => el.setAttribute('tabindex', '-1'));
        onClone?.(clone);
        track.appendChild(clone);
      });
    }

    track.style.setProperty('--gr-marquee-shift', `${-100 / copies}%`);
    viewport.classList.add('is-looping');
    window.addEventListener('resize', onResize);

    lastY = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); },
        { threshold: 0 });
      io.observe(viewport);
    }
  }

  function unmount() {
    if (!on) return;
    on = false;

    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', sync);
    io?.disconnect();
    io = null;

    if (frame) { cancelAnimationFrame(frame); frame = null; }
    rate = DRIFT;
    anim = null;

    viewport.classList.remove('is-looping');
    track.style.removeProperty('--gr-marquee-shift');
    track.querySelectorAll(`.${CLONE_CLASS}`).forEach((el) => el.remove());
  }

  /* A window dragged wider does not change which SHAPE a section is wearing,
     so the layout controller has no reason to call anything — but it can leave
     a frame wider than the copies behind the travel, which is the gap all over
     again. Rebuild only when that is actually true; a narrower window is
     already covered by copies it no longer needs. */
  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!on || (copies - 1) * copyW >= viewport.clientWidth) return;
      unmount();
      mount();
    }, 200);
  }

  return { mount, unmount, mounted: () => on };
}
