/**
 * faq-page.js — accessible accordion (custom-styled, no Bootstrap dependency).
 * Single-open behaviour; animates max-height for a smooth reveal.
 */
const container = document.querySelector('[data-faq]');
if (container) {
  const items = [...container.querySelectorAll('.faq-item')];
  items.forEach((item) => {
    const btn = item.querySelector('.faq-q');
    const panel = item.querySelector('.faq-a');
    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      // Close others (single-open).
      items.forEach((other) => {
        const b = other.querySelector('.faq-q'); const p = other.querySelector('.faq-a');
        b.setAttribute('aria-expanded', 'false'); p.style.maxHeight = null;
      });
      if (!isOpen) { btn.setAttribute('aria-expanded', 'true'); panel.style.maxHeight = `${panel.scrollHeight}px`; }
    });
  });
}
