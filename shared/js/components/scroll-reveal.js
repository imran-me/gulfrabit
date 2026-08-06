/**
 * scroll-reveal — IntersectionObserver fade/slide-up as sections enter view.
 * Subtle by design (see [data-reveal] in _animations.css): 300ms, no bounce.
 *
 * Any element with `data-reveal` animates once. Add `data-reveal-stagger` on a
 * parent to cascade its [data-reveal] children with a small incremental delay.
 *
 * THIS MUST FAIL OPEN.
 * The CSS starts every [data-reveal] at opacity 0 and waits for .is-visible.
 * That makes a decorative animation load-bearing: if the observer does not
 * fire — a restored scroll position, a fast scroll past the threshold, an
 * extension that interferes, a browser quirk — the section stays invisible
 * FOREVER, and the customer sees an empty page where the shop should be.
 * That happened on the home page: "Shop by Category" with nothing under it.
 *
 * So the observer is now the fast path, not the only path:
 *   1. the observer reveals things as they arrive, as before;
 *   2. a cheap rAF-throttled scroll/resize pass reveals anything already in
 *      view that the observer missed, which costs nothing when it works;
 *   3. a final timer reveals everything still hidden, so no failure mode
 *      short of JavaScript being off can hide content — and with it off, the
 *      .no-js rule shows everything anyway.
 *
 * Content is fully present in the HTML; this only toggles a class.
 */

/** How long to wait before deciding the observer is never going to fire. */
const FAILSAFE_MS = 2500;

export function initScrollReveal(root = document) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Apply stagger delays up front (inline custom property).
  root.querySelectorAll('[data-reveal-stagger]').forEach((group) => {
    const step = Number(group.getAttribute('data-reveal-stagger')) || 70;
    group.querySelectorAll('[data-reveal]').forEach((child, i) => {
      child.style.setProperty('--reveal-delay', `${i * step}ms`);
    });
  });

  const items = [...root.querySelectorAll('[data-reveal]')];
  if (!items.length) return;

  const show = (el) => el.classList.add('is-visible');

  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(show);
    return;
  }

  const pending = new Set(items);
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      show(entry.target);
      pending.delete(entry.target);
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  items.forEach((el) => observer.observe(el));

  // ---- Backstop 1: anything already on screen that the observer missed ----
  let queued = false;
  const sweep = () => {
    queued = false;
    if (!pending.size) return;

    const h = window.innerHeight || document.documentElement.clientHeight;
    for (const el of [...pending]) {
      const r = el.getBoundingClientRect();
      // Any part of it within the viewport, or scrolled past above it.
      if (r.top < h && r.bottom > 0) {
        show(el);
        pending.delete(el);
        observer.unobserve(el);
      }
    }
    if (!pending.size) teardown();
  };

  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sweep);
  };

  // ---- Backstop 2: give up gracefully and show everything ----------------
  const failsafe = setTimeout(() => {
    pending.forEach((el) => { show(el); observer.unobserve(el); });
    pending.clear();
    teardown();
  }, FAILSAFE_MS);

  function teardown() {
    clearTimeout(failsafe);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // One immediate pass, for a page that loads already scrolled.
  onScroll();
}
