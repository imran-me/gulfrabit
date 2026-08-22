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

/**
 * Seeded photographs: tools/gen-product-tiers.py cuts the copies.
 *
 * The FOLDER is part of the rule, not just the extension. Category art also
 * lives under /assets/images/ as .jpg, and it is cut to a completely different
 * ladder (160/280/560, by gen-category-images.py) — so matching on ".jpg"
 * alone would happily derive `dates-nuts-thumb.webp` for a file that has never
 * existed. Nothing calls this with a category image today; the guard is here
 * so that the day something does, it gets a null rather than a broken image.
 */
const PRODUCTS = '/assets/images/products/';
const MASTERS = ['.jpg', '.jpeg', '.png'];

/**
 * Uploaded photographs: ImageStore cuts the copies at upload time, and
 * `php artisan media:tiers` — which deploy.sh runs on every deploy — catches
 * anything uploaded before it did.
 *
 * Matched on the folder, not the extension. Every upload is a .webp, and so
 * are the copies, so extension alone cannot tell a master from its own
 * thumbnail — deriving a tier from a tier would ask for `<hash>-thumb-thumb`.
 */
const UPLOADS = '/uploads/';

/** A copy, not a master. Guards against building `-thumb-thumb`. */
const IS_TIER = /-(?:card|thumb)\.webp$/i;

/**
 * The WebP variant for a master, or null when there is not one.
 *
 * Null for an SVG placeholder — already tiny, and no raster copies exist.
 *
 * Uploads DO get copies: ImageStore writes them at upload time and deploy.sh
 * backfills anything older. That ordering is load-bearing, because a derived
 * URL which does not exist is a 404 inside a <source>, and a <source> that
 * fails does not fall back to the <img> — it shows a broken image.
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

  const isMaster = MASTERS.includes(ext) && path.includes(PRODUCTS);
  const isUpload = ext === '.webp' && path.includes(UPLOADS) && !IS_TIER.test(path);

  if (!isMaster && !isUpload) return null;

  // 'full' for an upload is the file we already have: ImageStore caps every
  // upload at 2000px and stores it as WebP, so there is no larger copy to
  // point at and re-stating the same URL in a <source> is a wasted element.
  const suffix = kind === 'full' ? '' : `-${kind}`;

  if (isUpload && kind === 'full') return null;

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
