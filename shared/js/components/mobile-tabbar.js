/**
 * mobile-tabbar.js — the fixed bottom navigation on phones.
 *
 * Every serious commerce app in this market ships one, for the same reason:
 * ad traffic is phones, and a cart that lives behind a hamburger is a cart
 * that takes two taps and a hunt. This puts Home / Shop / Cart / Account at
 * the thumb on every browse page.
 *
 * Injected from JS rather than authored into 47 pages: it is chrome, it is
 * identical everywhere it appears, and pages that must NOT show it announce
 * themselves (see the suppression list). No-JS visitors lose nothing they
 * had — the header and footer carry the same links.
 */

import * as store from '../core/state.js';
import { siteURL } from '../core/paths.js';
import { openCartDrawer } from './cart-drawer.js';

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5.5h5V20"/>',
  shop: '<path d="M4 4h7v7H4z"/><path d="M13 4h7v7h-7z"/><path d="M4 13h7v7H4z"/><path d="M13 13h7v7h-7z"/>',
  cart: '<path d="M6 7h12l-1 13H7z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  account: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
};

const icon = (k) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${ICONS[k]}</svg>`;

export function initMobileTabbar() {
  /* Pages that own their bottom edge. The cart page and express checkout pin
     their own action bars there; the product page pins the buy bar; the admin
     is staff furniture. Stacking a second bar under any of them either buries
     the money button or doubles the chrome. */
  if (document.querySelector(
    '[data-admin-shell], .cart-mobile-cta, [data-express-place], [data-pdp-buybar]')) return;
  if (document.querySelector('.tabbar')) return;

  const path = location.pathname;
  const active = /\/modules\/account\//.test(path) ? 'account'
    : /\/modules\/(catalog|deals|bundle)\//.test(path) ? 'shop'
    : (path === '/' || /index\.html$/.test(path)) ? 'home'
    : null;

  const item = (k, label, bn, href) => `
    <a class="tabbar__item${active === k ? ' is-active' : ''}" href="${href}"
       ${active === k ? 'aria-current="page"' : ''}>${icon(k)}<span class="tabbar__labels"><span>${label}</span><span class="tabbar__bn bn" lang="bn">${bn}</span></span></a>`;

  const nav = document.createElement('nav');
  nav.className = 'tabbar';
  nav.setAttribute('aria-label', 'Quick navigation');
  nav.innerHTML =
    item('home', 'Home', 'হোম', siteURL(''))
    + item('shop', 'Shop', 'শপ', siteURL('shop'))
    + `<button class="tabbar__item" type="button" data-tabbar-cart>
         <span class="tabbar__iconwrap">${icon('cart')}<span class="tabbar__badge" data-tabbar-count hidden></span></span>
         <span class="tabbar__labels"><span>Cart</span><span class="tabbar__bn bn" lang="bn">কার্ট</span></span></button>`
    + item('account', 'Account', 'অ্যাকাউন্ট', siteURL('account'));
  document.body.appendChild(nav);
  document.body.classList.add('has-tabbar');

  /* The same drawer the header opens — a tab that navigated to a page while
     the header opened a panel would make the two cart buttons disagree. */
  nav.querySelector('[data-tabbar-cart]').addEventListener('click', openCartDrawer);

  const badge = nav.querySelector('[data-tabbar-count]');
  const sync = () => {
    const n = store.cartCount();
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
  };
  sync();
  store.subscribe(store.EVENTS.CART, sync);
}
