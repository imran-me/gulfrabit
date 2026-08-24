/**
 * product-picker.js — find a product by typing, from any panel screen.
 *
 * WHAT IT REPLACES. A `<select>` holding every product. That works at twelve
 * products and stops working somewhere around forty: a dropdown cannot be
 * searched, it cannot show you a thumbnail, and two products called "Saffron —
 * Heritage Jar" and "Saffron — Grade A1" are indistinguishable in it. Worse,
 * the list it held came from one `perPage=100` request, so on a catalogue past
 * a hundred products the ones that mattered were simply absent with nothing
 * saying so.
 *
 * SO IT SEARCHES THE SERVER, not a copy of the catalogue held in the page. The
 * products endpoint has taken `q` since it was written; this is the first
 * control to use it. That means the picker is correct at any catalogue size,
 * and it means what you type is matched against title, SKU and brand by the
 * same query the Products screen uses — one definition of "matches", not two.
 *
 * ARCHIVED PRODUCTS ARE NOT OFFERED. The endpoint's default scope is the
 * working catalogue, and something the merchant has put away should not be
 * proposed for the home page. Unlisted ones ARE offered, and marked: putting a
 * product on a shelf before switching it on is a normal order of work.
 *
 * Usage:
 *
 *   mountProductPicker(hostElement, {
 *     exclude: () => new Set(alreadyChosenSkus),
 *     onPick: (product) => { … },
 *   });
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';

let seq = 0;

/**
 * @param {HTMLElement} host          replaced by the picker
 * @param {{
 *   exclude?: () => Set<string>,
 *   onPick: (product: object) => void,
 *   placeholder?: string,
 * }} opts
 */
export function mountProductPicker(host, { exclude = () => new Set(), onPick, placeholder } = {}) {
  const id = `pp${++seq}`;

  host.classList.add('ppick');
  host.innerHTML = `
    <input class="input-gr ppick__input" type="search" role="combobox"
           id="${id}-in" aria-expanded="false" aria-controls="${id}-list"
           aria-autocomplete="list" autocomplete="off"
           placeholder="${escapeHtml(placeholder || 'Search products by name, SKU or brand…')}">
    <ul class="ppick__list" id="${id}-list" role="listbox" hidden></ul>`;

  const input = host.querySelector('.ppick__input');
  const list = host.querySelector('.ppick__list');

  let results = [];
  let active = -1;
  let debounce;
  let token = 0;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const paint = () => {
    if (!results.length) {
      list.innerHTML = `<li class="ppick__none">${
        input.value.trim() ? 'Nothing matches that.' : 'Type to search the catalogue.'
      }</li>`;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    list.innerHTML = results.map((p, i) => `
      <li class="ppick__opt${i === active ? ' is-active' : ''}" role="option"
          id="${id}-o${i}" aria-selected="${i === active}" data-i="${i}">
        <span class="ppick__pic">${
          p.image ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy">` : ''
        }</span>
        <span class="ppick__text">
          <strong>${escapeHtml(p.title)}</strong>
          <small>${escapeHtml(p.sku)}${p.brand ? ` · ${escapeHtml(p.brand)}` : ''}${
            p.isActive ? '' : ' · unlisted'
          }</small>
        </span>
        <span class="ppick__price">৳${Number(p.priceTaka ?? 0).toLocaleString('en-BD')}</span>
      </li>`).join('');

    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');

    if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-o${active}`);
  };

  const search = async (term) => {
    // Every request carries a token and only the newest one is allowed to
    // paint. Typing "saf" fires three searches and they can come back in any
    // order; without this the list can settle on the answer to "sa".
    const mine = ++token;

    let payload;
    try {
      payload = await adminFetch(`/products?perPage=12${term ? `&q=${encodeURIComponent(term)}` : ''}`);
    } catch {
      if (mine === token) {
        results = [];
        paint();
      }
      return;
    }

    if (mine !== token) return;

    const already = exclude();

    results = payload.data.filter((p) => !already.has(p.sku));
    active = results.length ? 0 : -1;

    paint();
  };

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    // 200ms: long enough that a fast typist sends one request instead of six,
    // short enough that it does not feel like waiting.
    debounce = setTimeout(() => search(input.value.trim()), 200);
  });

  // Opening on focus rather than only on the first keystroke, so the control
  // still answers "what have I got?" the way the dropdown it replaced did.
  input.addEventListener('focus', () => {
    if (!results.length) search(input.value.trim());
    else paint();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();

      if (list.hidden) return paint();

      const step = e.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + results.length) % results.length;

      paint();
      list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (e.key === 'Enter') {
      // Only when a row is highlighted. Enter with nothing chosen must not
      // submit the form this picker often sits inside.
      e.preventDefault();
      if (active >= 0 && results[active]) choose(results[active]);
    }
  });

  list.addEventListener('mousedown', (e) => {
    // mousedown, not click: the input's blur would close the list first and
    // the click would land on nothing.
    const opt = e.target.closest('[data-i]');
    if (!opt) return;

    e.preventDefault();
    choose(results[Number(opt.dataset.i)]);
  });

  document.addEventListener('click', (e) => {
    if (!host.contains(e.target)) close();
  });

  function choose(product) {
    if (!product) return;

    onPick?.(product);

    // Cleared, because the next thing someone does after adding a product to
    // a shelf is add another one — and leaving the last search in the box
    // means the second one starts by deleting the first.
    input.value = '';
    results = [];
    close();
    input.focus();
  }

  return {
    focus: () => input.focus(),
    /** Re-run the current search — for after the exclude set changes. */
    refresh: () => search(input.value.trim()),
  };
}
