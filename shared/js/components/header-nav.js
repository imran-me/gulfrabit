/**
 * header-nav — behaviour for the site header (markup lives in the HTML).
 *
 * Enhances (never renders) the header:
 *  - sticky "glass" state: adds .is-scrolled past a threshold (blur + elevation)
 *  - desktop mega-menu: open on hover + keyboard focus, close on blur/Escape
 *  - mobile drawer: hamburger toggles the offcanvas; category accordion inside
 *  - live cart / wishlist count badges synced to shared state
 *  - dismissible announcement bar (remembers dismissal via storage)
 *  - full-screen search overlay toggle
 *
 * All content is in header.html; disabling JS leaves a fully usable header.
 */

import * as store from '../core/state.js';
import { storage, KEYS } from '../core/storage.js';

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
  const open = () => {
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    requestAnimationFrame(() => { backdrop.style.opacity = '1'; });
    document.body.style.overflow = 'hidden';
    openBtn.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.style.opacity = '0';
    setTimeout(() => { backdrop.hidden = true; }, 300);
    document.body.style.overflow = '';
    openBtn.setAttribute('aria-expanded', 'false');
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

/* ---- Cart / wishlist count badges ------------------------------------- */
function initCountBadges() {
  const cartBadge = document.querySelector('[data-cart-count]');
  const wishBadge = document.querySelector('[data-wishlist-count]');

  const syncCart = () => setBadge(cartBadge, store.cartCount());
  const syncWish = () => setBadge(wishBadge, store.wishlistCount());

  syncCart(); syncWish();
  store.subscribe(store.EVENTS.CART, syncCart);
  store.subscribe(store.EVENTS.WISHLIST, syncWish);

  function setBadge(el, count) {
    if (!el) return;
    el.textContent = count > 99 ? '99+' : String(count);
    el.classList.toggle('is-active', count > 0);
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

/* ---- Full-screen search overlay --------------------------------------- */
function initSearchOverlay() {
  const overlay = document.querySelector('.search-overlay');
  const openBtns = document.querySelectorAll('[data-open-search]');
  if (!overlay || !openBtns.length) return;
  const input = overlay.querySelector('input');
  const open = () => { overlay.classList.add('is-open'); setTimeout(() => input?.focus(), 60); };
  const close = () => overlay.classList.remove('is-open');
  openBtns.forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(); }));
  overlay.querySelector('[data-close-search]')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/* ---- Mark the active top-level nav item ------------------------------- */
function markActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link[data-nav-match]').forEach((link) => {
    if (path.includes(link.getAttribute('data-nav-match'))) link.setAttribute('aria-current', 'page');
  });
}
