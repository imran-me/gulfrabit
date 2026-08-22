/**
 * product-image.js — which copy of a product photograph to serve.
 *
 * tools/gen-product-tiers.py writes three WebP variants beside every master:
 *
 *     gr-1101.webp          the master, re-encoded
 *     gr-1101-card.webp     640px — the card grid and the PDP
 *     gr-1101-thumb.webp    128px — the cart line and the search dropdown
 *
 * WHY THIS IS A MODULE AND NOT THREE COPIES OF A ONE-LINER. It was already
 * two: product-card.js knew about `-card.webp` and product-page.js had its own
 * `variant()` that knew the same thing slightly differently. The three
 * surfaces that did NOT know — the cart drawer, quick view, and the search
 * dropdown — served the raw master into boxes 64 and 40 pixels wide. Six
 * suggestions in a dropdown was most of a megabyte of JPEG to decorate a list.
 * A rule spread across five files is a rule two of them will not have.
 *
 * THE MASTER STAYS THE <img> src, always. Everything here goes in a <source>,
 * so a browser without WebP — and any deployment where the variants were never
 * generated — renders exactly what it did before. Nothing in this file is
 * load-bearing; it makes an existing picture smaller or it does nothing.
 */

/** Only these become variants. Anything else is passed through untouched. */
const MASTERS = ['.jpg', '.jpeg', '.png'];

/**
 * The WebP variant for a master, or null when there is not one.
 *
 * Null for an SVG placeholder (already tiny, no raster variants exist), and
 * null for anything the merchant uploaded through the media library — those
 * arrive as /uploads/…/<hash>.webp, already re-encoded and size-capped by
 * ImageStore, and inventing a `-thumb` URL for one would be a 404 in place of
 * a photograph.
 *
 * @param {string} src
 * @param {'full'|'card'|'thumb'} kind
 * @returns {string|null}
 */
export function imageVariant(src, kind = 'card') {
  const path = String(src || '');
  const dot = path.lastIndexOf('.');

  if (dot < 1) return null;

  const ext = path.slice(dot).toLowerCase();
  if (!MASTERS.includes(ext)) return null;

  const suffix = kind === 'full' ? '' : `-${kind}`;

  return `${path.slice(0, dot)}${suffix}.webp`;
}

/**
 * A ready `<source>` tag, or '' when there is no variant to offer.
 *
 * Returns markup rather than a URL because every caller wants the same tag,
 * and the one that hand-rolled it is the one that got the type attribute
 * wrong. Safe to drop straight inside a <picture>: an empty string is a
 * <picture> with nothing but its <img>, which is a plain image.
 */
export function imageSource(src, kind = 'card') {
  const url = imageVariant(src, kind);

  if (!url) return '';

  // No escaping needed beyond the quote: these paths are built from a
  // filename the build controls, not from anything a customer typed. The
  // attribute quote is closed defensively all the same.
  return `<source srcset="${url.replace(/"/g, '&quot;')}" type="image/webp">`;
}
