/**
 * header-nav — behaviour for the site header (markup lives in the HTML).
 *
 * Enhances (never renders) the header:
 *  - sticky "glass" state: adds .is-scrolled past a threshold (blur + elevation)
 *  - desktop mega-menu: open on hover + keyboard focus, close on blur/Escape
 *  - mobile drawer: hamburger toggles the offcanvas (the accordion handler
 *    below is generic and fires only if a drawer carries one)
 *  - live cart / wishlist count badges synced to shared state
 *  - dismissible announcement bar (remembers dismissal via storage)
 *  - full-screen search overlay toggle
 *
 * All content is in header.html; disabling JS leaves a fully usable header.
 */

import * as store from '../core/state.js';
import { storage, KEYS } from '../core/storage.js';
import { trapFocus } from '../utils/focus-trap.js';

export function initHeader() {
  initStickyGlass();
  initMegaMenu();
  initMobileDrawer();
  initCountBadges();
  initAnnouncement();
  initSearchOverlay();
  markActiveNav();
}

/* ---- Sticky glass ------------------------------------------------------ */
function initStickyGlass() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ---- Desktop mega-menu ------------------------------------------------- */
function initMegaMenu() {
  const items = document.querySelectorAll('.nav-item.has-mega');
  items.forEach((item) => {
    const link = item.querySelector('.nav-link');
    const open = () => { closeAll(); item.classList.add('is-open'); link?.setAttribute('aria-expanded', 'true'); };
    const close = () => { item.classList.remove('is-open'); link?.setAttribute('aria-expanded', 'false'); };

    item.addEventListener('mouseenter', open);
    item.addEventListener('mouseleave', close);
    link?.addEventListener('click', (e) => { e.preventDefault(); item.classList.contains('is-open') ? close() : open(); });
    item.addEventListener('focusout', (e) => { if (!item.contains(e.relatedTarget)) close(); });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  function closeAll() { items.forEach((i) => { i.classList.remove('is-open'); i.querySelector('.nav-link')?.setAttribute('aria-expanded', 'false'); }); }
}

/* ---- Mobile offcanvas drawer ------------------------------------------ */
function initMobileDrawer() {
  const drawer = document.getElementById('mobileNav');
  const openBtn = document.querySelector('[data-open-mobile-nav]');
  if (!drawer || !openBtn) return;

  const backdrop = ensureBackdrop();
  let releaseTrap = null;
  const open = () => {
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    requestAnimationFrame(() => { backdrop.style.opacity = '1'; });
    document.body.style.overflow = 'hidden';
    openBtn.setAttribute('aria-expanded', 'true');
    releaseTrap = trapFocus(drawer);
  };
  const close = () => {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.style.opacity = '0';
    setTimeout(() => { backdrop.hidden = true; }, 300);
    document.body.style.overflow = '';
    openBtn.setAttribute('aria-expanded', 'false');
    if (releaseTrap) { releaseTrap(); releaseTrap = null; }
  };
  openBtn.addEventListener('click', open);
  drawer.querySelectorAll('[data-close-mobile-nav]').forEach((b) => b.addEventListener('click', close));
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Collapsible category accordion inside the drawer.
  drawer.querySelectorAll('[data-accordion-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.nextElementSibling;
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      if (panel) panel.hidden = open;
    });
  });

  function ensureBackdrop() {
    let bd = document.querySelector('.mobile-nav-backdrop');
    if (bd) return bd;
    bd = document.createElement('div');
    bd.className = 'mobile-nav-backdrop';
    Object.assign(bd.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.6)', zIndex: '1040',
      opacity: '0', transition: 'opacity .3s var(--ease-out)',
    });
    bd.hidden = true;
    document.body.appendChild(bd);
    return bd;
  }
}

/* ---- Cart / wishlist count badges -------------------------------------
   The number goes in the CONTROL'S NAME, not just in the badge.

   Both badges used to be aria-live="polite" spans inside a button carrying its
   own aria-label. An aria-label overrides the element's contents, so the badge
   was never read as part of "Open cart" — a screen reader user could sit on
   the cart button and not be told there was anything in it. What they were
   told, the moment the count changed, was a bare "3": a number with no noun,
   arriving on top of the toast that had just said what was added.

   So the span is aria-hidden now and the count is written into the button's
   label. Changing an aria-label does not announce, which is the point: the
   toast is the announcement, and the button finally reads correctly when the
   user arrives at it. */
function initCountBadges() {
  const cartBadge = document.querySelector('[data-cart-count]');
  const wishBadge = document.querySelector('[data-wishlist-count]');

  const syncCart = () => setBadge(cartBadge, store.cartCount(), 'Open cart');
  const syncWish = () => setBadge(wishBadge, store.wishlistCount(), 'Wishlist');

  syncCart(); syncWish();
  store.subscribe(store.EVENTS.CART, syncCart);
  store.subscribe(store.EVENTS.WISHLIST, syncWish);

  function setBadge(el, count, name) {
    if (!el) return;
    el.textContent = count > 99 ? '99+' : String(count);
    el.classList.toggle('is-active', count > 0);

    // The badge shows "99+"; the label says the real number, because "99+
    // items" is a design decision about width and not something worth reading
    // aloud.
    el.closest('button, a')?.setAttribute(
      'aria-label',
      count ? `${name}, ${count} item${count === 1 ? '' : 's'}` : `${name}, empty`
    );
  }
}

/* ---- Announcement bar -------------------------------------------------- */
function initAnnouncement() {
  const bar = document.querySelector('.announce-bar');
  if (!bar) return;
  if (storage.get(KEYS.ANNOUNCE_DISMISSED)) { bar.hidden = true; return; }
  bar.querySelector('.announce-bar__close')?.addEventListener('click', () => {
    bar.hidden = true;
    storage.set(KEYS.ANNOUNCE_DISMISSED, true);
  });
}

/* ---- Full-screen search overlay ---------------------------------------
   The markup says role="dialog" aria-modal="true", and for a long time the
   behaviour said neither. Tabbing out of the search box landed on the hero
   links behind the overlay — content a screen reader had just been told did
   not exist, because that is what aria-modal means. The page behind scrolled
   too, and closing dropped focus wherever Tab had wandered to.

   The mobile drawer above already does all three correctly. This is the same
   contract: trap, lock, restore. */
function initSearchOverlay() {
  const overlay = document.querySelector('.search-overlay');
  const openBtns = document.querySelectorAll('[data-open-search]');
  if (!overlay || !openBtns.length) return;

  const input = overlay.querySelector('input');
  let releaseTrap = null;

  const open = () => {
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    openBtns.forEach((b) => b.setAttribute('aria-expanded', 'true'));

    // Trapped first, so it captures the button that is still focused as the
    // place to send focus back to. Then the search box specifically — the
    // first focusable in the DOM is the close button, and opening search only
    // to land on "Close search" is a joke at the customer's expense.
    releaseTrap = trapFocus(overlay);
    setTimeout(() => input?.focus(), 60);
  };

  const close = () => {
    // Guarded: Escape is bound to the document, so this runs on every Escape
    // anywhere on the site. Without the guard, closing an already-closed
    // overlay would yank focus back to the search button.
    if (!overlay.classList.contains('is-open')) return;

    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    openBtns.forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (releaseTrap) { releaseTrap(); releaseTrap = null; }
  };

  openBtns.forEach((b) => {
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', (e) => { e.preventDefault(); open(); });
  });
  overlay.querySelector('[data-close-search]')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/* ---- Mark the active top-level nav item ------------------------------- */
function markActiveNav() {
  // Query string included: the category shortcuts in the nav are all one page
  // (category.html) told apart by ?slug=, so matching on the pathname alone
  // meant every category item was either all highlighted or none of them were.
  const path = window.location.pathname + window.location.search;
  document.querySelectorAll('.nav-link[data-nav-match]').forEach((link) => {
    if (path.includes(link.getAttribute('data-nav-match'))) link.setAttribute('aria-current', 'page');
  });

  // Home is matched by rule, not by the substring test above, because it is
  // the one destination whose URL can be written two ways — "/index.html" and
  // a bare "/" — and no substring satisfies both. Same test the bottom tab
  // bar uses, so the header and the tab bar cannot disagree about whether the
  // visitor is on the front page. Marks the drawer row as well as the desktop
  // icon: [data-nav-home] is on both.
  if (location.pathname === '/' || /index\.html$/.test(location.pathname)) {
    document.querySelectorAll('[data-nav-home]')
      .forEach((link) => link.setAttribute('aria-current', 'page'));
  }
}
