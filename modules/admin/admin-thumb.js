/**
 * admin-thumb.js — one product photograph, at the size a staff screen needs.
 *
 * WHY THE ORDER SCREENS HAD NO PICTURES
 * -------------------------------------
 * Not because nothing was stored. `order_items` has carried an `image` column
 * since the table was created — the snapshot that exists so re-shooting a
 * product cannot rewrite what a past order shows. The admin endpoints simply
 * never selected it, so a shop that sells things you recognise by sight worked
 * its orders off a wall of text.
 *
 * WHY THIS IS A MODULE AND NOT TWO COPIES OF AN <img> TAG
 * ------------------------------------------------------
 * Three rules have to hold on every thumbnail in the panel, and each of them
 * is the kind that a second copy gets wrong:
 *
 *   1. SERVE THE SMALL COPY. gen-product-tiers.py cuts a 128px `-thumb.webp`
 *      beside every master. The master is 148KB of JPEG; the thumb is 2.4KB.
 *      Twenty-five order rows with three pictures each is 11MB of photography
 *      to decorate a list, or 180KB — the difference is one <source> element.
 *
 *   2. NEVER SHOW A BROKEN GLYPH. `image` is a plain column. It can name a
 *      file that was deleted, a product that was never photographed, or — for
 *      an order placed before the tiers existed — a path whose WebP copy was
 *      never cut. A <source> that 404s does NOT fall back to the <img>; it
 *      renders broken. So every failure lands on a designed lettered tile
 *      instead, and the screen says "no picture" rather than "something is
 *      wrong with this page".
 *
 *   3. COST NOTHING ABOVE THE FOLD. Lazy, async, and sized in the attributes
 *      so a row cannot reflow when its picture arrives.
 *
 * THE PICTURES ARE DECORATIVE, ALWAYS
 * -----------------------------------
 * Every thumbnail here sits beside the product's name, or inside a stack whose
 * container is labelled with the names. So each one is `aria-hidden` with an
 * empty `alt`: a screen reader that read "Ajwa Dates — Madinah Select" twice
 * per line would be worse off than one that read it once.
 *
 * That is also why nothing in this file is a link. Wrapping a decorative,
 * aria-hidden picture in an anchor produces a link with no accessible name,
 * and the two usual repairs — naming the link after the picture, or hiding a
 * duplicate link from the keyboard — are both worse than putting the link on
 * the product's name, where a person reading the row is already looking.
 */

import { imageSource } from '../../shared/js/core/product-image.js';
import { escapeHtml } from './admin-shell.js';

/**
 * The letter on the fallback tile.
 *
 * Spread rather than charAt: a title starting outside the basic plane would
 * otherwise be cut in half and render as a replacement glyph, which is the
 * broken-image problem again in a different costume. Titles here are Bengali,
 * Arabic and English, and all three come through whole.
 */
function initial(title) {
  const first = [...String(title || '').trim()][0];
  return first ? first.toUpperCase() : '·';
}

/**
 * One thumbnail: a <picture> when there is a photograph, a lettered tile when
 * there is not.
 *
 * The master stays the <img> src and the small copy goes in a <source>, which
 * is the rule product-image.js exists to hold: a browser without WebP, or a
 * deployment where the tiers were never cut, renders exactly what it would
 * have rendered before.
 *
 * @param {string|null|undefined} image  the snapshotted path, or nothing
 * @param {string} title                 the product name, for the fallback letter
 * @param {'sm'|'lg'|''} size
 */
export function thumb(image, title, size = '') {
  watchForBroken();

  const cls = `athumb${size ? ` athumb--${size}` : ''}`;
  const letter = escapeHtml(initial(title));

  // Carried on the element so the error handler below can build the tile
  // without having to find its way back to the order line that produced it.
  const attrs = `class="${cls}" data-athumb-letter="${letter}" aria-hidden="true"`;

  if (!image) {
    return `<span ${attrs} data-athumb-blank><span class="athumb__letter">${letter}</span></span>`;
  }

  // 128 square is the tier's own size. The CSS paints it at 32 or 44, so these
  // are here only to give the box an aspect ratio before the bytes land —
  // without them a list of twenty-five rows settles twice.
  return `<picture ${attrs}>${imageSource(image, 'thumb')}<img
    src="${escapeHtml(image)}" alt="" width="128" height="128"
    loading="lazy" decoding="async"></picture>`;
}

/**
 * The first few products in an order, as overlapping pictures.
 *
 * `lineCount` is how many distinct products the order actually has; `items` is
 * the capped preview the server sent. The difference is drawn as "+N", so the
 * cap lives on the server alone (AdminOrderController::ROW_THUMBS) and the row
 * cannot disagree with it.
 *
 * Returns '' when there is nothing to draw — including when an older backend
 * sends no preview at all, which is what keeps the order list working through
 * the minute between a deploy landing the JS and landing the PHP.
 */
export function thumbStack(items, lineCount = 0) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return '';

  /* `|| 0` before the subtraction, not after. A missing lineCount makes this
     NaN, and NaN is falsy, so the "+N" would happen to be skipped — but only
     by accident, and the next person to write `more > 0` would be reading a
     comparison that is false for the wrong reason. */
  const more = Math.max(0, (Number(lineCount) || 0) - list.length);
  const names = list.map((i) => String(i.title || 'Unnamed product'));

  /* One label for the whole stack, because the pictures are one fact: what is
     in this order. Reading three empty images and a "+2" is not that fact. */
  const label = names.join(', ') + (more ? `, and ${more} more` : '');

  return `<span class="athumbs" role="img" aria-label="${escapeHtml(label)}">${
    list.map((i) => thumb(i.image, i.title, 'sm')).join('')
  }${more ? `<span class="athumbs__more">+${more}</span>` : ''}</span>`;
}

/**
 * Replace any thumbnail whose file does not load with its lettered tile.
 *
 * ONE LISTENER, ON THE DOCUMENT, IN THE CAPTURE PHASE — not one per image.
 * These lists are repainted by every filter, every page of the pager and every
 * bulk move, so handlers bound to the images themselves would have to be
 * re-bound after each repaint, and the repaint that forgot would be the one
 * that showed a broken glyph.
 *
 * `error` does not bubble, which is why this cannot be an ordinary delegated
 * listener — but it does reach ancestors on the way DOWN, so a capture-phase
 * listener on the document sees every failure in the panel, including images
 * that were already in flight when it was installed.
 */
let watching = false;

function watchForBroken() {
  if (watching) return;
  watching = true;

  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;

    const host = img.closest('.athumb');
    if (!host) return;

    // The letter was escaped when it was written into the attribute; reading it
    // back gives the decoded character, so it is escaped once more on the way
    // in. A product titled `<script>` is a silly name, not an opening.
    host.innerHTML =
      `<span class="athumb__letter">${escapeHtml(host.dataset.athumbLetter || '·')}</span>`;
    host.setAttribute('data-athumb-blank', '');
  }, true);
}
