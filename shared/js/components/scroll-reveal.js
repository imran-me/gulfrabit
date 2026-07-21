/**
 * scroll-reveal — IntersectionObserver fade/slide-up as sections enter view.
 * Subtle by design (see [data-reveal] in _animations.css): 300ms, no bounce.
 *
 * Any element with `data-reveal` animates once. Add `data-reveal-stagger` on a
 * parent to cascade its [data-reveal] children with a small incremental delay.
 *
 * Content is fully present in the HTML; this only toggles a class — the page is
 * completely readable with JS disabled or motion reduced.
 */

export function initScrollReveal(root = document) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Apply stagger delays up front (inline custom property).
  root.querySelectorAll('[data-reveal-stagger]').forEach((group) => {
    const step = Number(group.getAttribute('data-reveal-stagger')) || 70;
    group.querySelectorAll('[data-reveal]').forEach((child, i) => {
      child.style.setProperty('--reveal-delay', `${i * step}ms`);
    });
  });

  const items = root.querySelectorAll('[data-reveal]');
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  items.forEach((el) => observer.observe(el));
}
