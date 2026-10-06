/**
 * order-image-page.js — the orders somebody is about to be rung about, as
 * pictures ready to send.
 *
 * WHAT THIS SCREEN IS FOR
 * -----------------------
 * A placed order is not an order yet. It becomes one on the confirmation call,
 * and that call is made by customer care — who work from a chat, not from this
 * panel. So the job here is short: turn the selected orders into one picture
 * each and get those pictures out of the browser by whichever door the device
 * has. On a phone that is the share sheet, straight into the chat. At a desk it
 * is a download, or a copy that pastes into the chat's web page.
 *
 * NO NEW ENDPOINT
 * ---------------
 * It reads GET /orders/{no}, exactly as the packing slip does and for the
 * reason the slip gives: a second definition of what an order is would
 * disagree with the first the day one of them changed. The picture itself is
 * made in the browser — see order-image.js for why — so nothing about a
 * customer is written to disk on the server to make it.
 *
 * BATCHES
 * -------
 * ?no=A,B,C makes one picture per order. Settled, not all-or-nothing: an order
 * number that fails is reported on its own card and the rest are still made,
 * because the person waiting for these has a queue of calls and no interest in
 * which one of twenty had a typo.
 *
 * A DELETED ORDER IS NOT DRAWN. The order screen will not print a slip for one,
 * so that nobody is handed paper for an order that is off the floor. A picture
 * asking somebody to ring the customer about it would be worse.
 */

import { adminFetch } from './backend/api.js';
import { escapeHtml } from './admin-shell.js';
import { toast } from './admin-delete.js';
import { drawOrderImage, toPng, describe, fileName, loadFonts, loadLogo } from './order-image.js';

/* One finished picture per order that could be drawn, in the order they were
   asked for. `file` is what gets shared, copied and downloaded; `url` is the
   same bytes addressed for the <img> and the download link. */
let shots = [];

document.addEventListener('admin:ready', load);

function numbers() {
  const list = (new URLSearchParams(location.search).get('no') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Once each. The same number twice is a slip of the hand on the way here,
  // and two identical pictures in a chat read as two orders.
  return [...new Set(list)];
}

async function load() {
  const host = document.querySelector('[data-oimg-list]');
  if (!host) return;

  const list = numbers();
  if (!list.length) {
    return fail('No order number in the link. Open an order and choose “Order image”, '
      + 'or select orders on the list and make their images together.');
  }

  // The shape of the answer while it is on its way: one card per order asked
  // for, so the pictures replace something their own size instead of arriving
  // into an empty page.
  host.innerHTML = list.map(waiting).join('');

  const results = await Promise.all(list.map((no) =>
    adminFetch(`/orders/${encodeURIComponent(no)}`)
      .then((r) => ({ no, order: r.data }))
      .catch((err) => ({ no, error: err.message || 'Could not be loaded' }))));

  const drawable = results.filter((r) => r.order && !r.order.deletedAt).map((r) => r.order);

  // Fonts and the mark BEFORE the first stroke. A canvas draws with whatever
  // is loaded at that instant and never repaints — see loadFonts().
  const [logo] = await Promise.all([loadLogo(), loadFonts(drawable)]);

  // One clock for the whole batch, so twenty pictures made together say so.
  const now = new Date();

  const cards = [];
  for (const r of results) {
    cards.push(await card(r, { logo, now }));
  }
  host.innerHTML = cards.join('');

  paintHead(list.length);
  host.addEventListener('click', onCard);
}

/**
 * One order, drawn — or the reason it was not.
 *
 * Each order is drawn inside its own try, for the same reason the fetches are
 * settled: one order with something unexpected in it must cost its own picture
 * and not the other nineteen.
 */
async function card(r, { logo, now }) {
  if (!r.order) return broken(r.no, r.error);

  if (r.order.deletedAt) {
    return broken(r.no, 'This order was deleted, so there is nobody to ring about it. '
      + 'Restore it first if that was a mistake.');
  }

  let blob = null;
  let canvas = null;
  try {
    canvas = drawOrderImage(r.order, { logo, now });
    blob = await toPng(canvas);
  } catch {
    blob = null;
  }

  // Null, not an exception, is what a canvas past the browser's size limit
  // encodes to. Hundreds of lines on one order; the slip paginates and this
  // cannot.
  if (!blob) {
    return broken(r.no, 'This order is too long to fit in one image. Print its slip instead.');
  }

  const file = new File([blob], fileName(r.order), { type: 'image/png' });
  const i = shots.push({ no: r.order.orderNumber, file, url: URL.createObjectURL(file) }) - 1;

  return shot(i, r.order, canvas);
}

/* ---- The cards ---------------------------------------------------------- */

/* An <img>, not the canvas it was drawn on. A long press on an image offers
   Save and Share on every phone; a long press on a canvas offers nothing, and
   the person holding the phone would be right to think the picture cannot be
   taken anywhere. */
function shot(i, o, canvas) {
  const s = shots[i];
  const no = escapeHtml(s.no);
  const files = [s.file];

  // Whichever door this device has is the main one. Sharing where there is a
  // share sheet, because that goes straight into the chat; otherwise the
  // download, because that is all there is.
  const share = canShare(files);

  return `
    <figure class="oimg">
      <img class="oimg__img" src="${escapeHtml(s.url)}" alt="${escapeHtml(describe(o))}"
           width="${canvas.width}" height="${canvas.height}" decoding="async">
      <figcaption class="oimg__cap">
        <div class="oimg__who">
          <a href="/admin/order?no=${encodeURIComponent(s.no)}">${no}</a>
          <span>${escapeHtml(o.customer?.name || 'No name given')}</span>
        </div>
        <div class="oimg__actions">
          ${share ? `
            <button class="btn-gr btn-primary-gr btn-sm-gr" type="button"
                    data-oimg-act="share" data-oimg-i="${i}" aria-label="Share the image of ${no}">Share</button>` : ''}
          <button class="btn-gr ${share ? 'btn-outline-gr' : 'btn-primary-gr'} btn-sm-gr" type="button"
                  data-oimg-act="download" data-oimg-i="${i}" aria-label="Download the image of ${no}">Download</button>
          ${canCopy() ? `
            <button class="btn-gr btn-outline-gr btn-sm-gr" type="button"
                    data-oimg-act="copy" data-oimg-i="${i}" aria-label="Copy the image of ${no}">Copy</button>` : ''}
        </div>
      </figcaption>
    </figure>`;
}

/* The picture's proportions for an ordinary two-item order, so the grid does
   not jump when the real ones land. aria-hidden: the count above already says
   they are loading, once. */
function waiting() {
  return `
    <div class="oimg oimg--waiting" aria-hidden="true">
      <div class="oimg__img skeleton"></div>
      <div class="oimg__cap">
        <span class="skeleton oimg__bar"></span>
        <span class="skeleton oimg__bar oimg__bar--short"></span>
      </div>
    </div>`;
}

function broken(no, message) {
  return `
    <div class="oimg oimg--broken">
      <h2 class="oimg__no">${escapeHtml(no)}</h2>
      <p>${escapeHtml(message)}</p>
      <p class="oimg__aside">The other images were still made.</p>
    </div>`;
}

/**
 * The count, and the two buttons that act on every picture at once.
 *
 * Drawn only for two or more. With one picture, "Share all" beside "Share" is
 * the same button twice and a moment spent working out the difference.
 */
function paintHead(asked) {
  const made = shots.length;
  const missed = asked - made;

  document.querySelector('[data-oimg-count]').textContent = made
    ? `${made} image${made === 1 ? '' : 's'} ready${missed ? ` · ${missed} could not be made` : ''}`
    : 'No image could be made';

  if (made < 2) return;

  const all = document.querySelector('[data-oimg-all]');
  const shareAll = all.querySelector('[data-oimg-share-all]');
  const downloadAll = all.querySelector('[data-oimg-download-all]');
  const files = shots.map((s) => s.file);

  // Asked of the whole set, not assumed from one. A device that will share
  // one picture may still refuse twenty, and it says so here rather than
  // after the button has been pressed.
  if (canShare(files)) {
    shareAll.hidden = false;
    shareAll.textContent = `Share all ${made}`;
    shareAll.addEventListener('click', () => share(files));
    downloadAll.className = 'btn-gr btn-outline-gr btn-sm-gr';
  }

  downloadAll.textContent = `Download all ${made}`;
  downloadAll.addEventListener('click', () => downloadEvery(downloadAll));
  all.hidden = false;
}

/* ---- Getting a picture out of the browser ------------------------------- */

/* One listener on the list rather than three per card, as everywhere else in
   this panel. */
function onCard(e) {
  const btn = e.target.closest('[data-oimg-act]');
  if (!btn) return;

  const s = shots[Number(btn.dataset.oimgI)];
  if (!s) return;

  if (btn.dataset.oimgAct === 'share') return share([s.file]);
  if (btn.dataset.oimgAct === 'copy') return copy(s);
  download(s);
}

/* Both of these are questions about the device, and both can throw on a
   browser that has the method and dislikes the argument. */
function canShare(files) {
  try {
    return !!navigator.canShare?.({ files });
  } catch {
    return false;
  }
}

function canCopy() {
  return !!(navigator.clipboard?.write && window.ClipboardItem);
}

async function share(files) {
  try {
    // Files and nothing else. A title or a line of text beside them is turned
    // into a caption by some chat apps and into a second message by others,
    // and the picture already says everything it has to.
    await navigator.share({ files });
  } catch (err) {
    // Closing the share sheet is a decision, not a failure.
    if (err?.name === 'AbortError') return;
    toast('Sharing did not go through. Download the image and send it from there.', false);
  }
}

async function copy(s) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': s.file })]);
    toast(`${s.no} copied. Paste it into the chat.`);
  } catch {
    toast('This browser would not copy the image. Download it instead.', false);
  }
}

function download(s) {
  const a = document.createElement('a');
  a.href = s.url;
  a.download = s.file.name;
  // In the document for the click: a detached link's download is ignored by
  // some engines, and the failure is a button that does nothing.
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Every picture, as its own file.
 *
 * Separate files, not one archive: these are going into a chat, and a phone
 * cannot send the inside of a zip. Spaced out because a browser handed twenty
 * downloads in one tick keeps the first and drops the rest without a word.
 */
async function downloadEvery(btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  for (const s of shots) {
    download(s);
    await new Promise((resolve) => { setTimeout(resolve, 300); });
  }

  btn.disabled = false;
  btn.textContent = label;

  // The one way this goes wrong is the browser asking, once, whether this
  // site may save several files — and that question is easy to miss.
  toast(`${shots.length} images sent to your downloads. If the browser asks `
    + 'whether this site may save several files, allow it and press again.');
}

function fail(message) {
  const el = document.querySelector('[data-oimg-error]');
  el.textContent = message;
  el.hidden = false;
  document.querySelector('[data-oimg-count]').textContent = 'Nothing to make';
}
