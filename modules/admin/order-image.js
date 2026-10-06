/**
 * order-image.js — one order, drawn as a picture that can be sent to somebody.
 *
 * WHY A PICTURE AND NOT A LINK
 * ----------------------------
 * The confirmation call is made by customer care, and customer care does not
 * have to be in this panel to make it. What they need is the order in front of
 * them while the phone rings: who to ask for, the number, what was ordered,
 * where it is going and what it comes to. A link would need an account, a
 * sign-in and a screen built for working an order; a picture needs a chat app,
 * which they already have open.
 *
 * WHY IT IS DRAWN BY HAND ON A CANVAS
 * -----------------------------------
 * The alternatives were both worse. Rasterising the page's own HTML means
 * either a library that re-implements CSS layout, or an SVG <foreignObject>,
 * which Safari will draw and then refuse to export. And an image made on the
 * server needs PHP's GD to set Bengali — which it cannot shape, so every
 * conjunct in a customer's name would come out as its separate letters.
 *
 * The browser's own text engine shapes Bengali correctly, and a 2D canvas
 * hands that engine over with nothing in between. The price is that wrapping
 * and vertical rhythm are done here, by measurement. That is what most of
 * this file is.
 *
 * IT IS NOT THE PACKING SLIP
 * --------------------------
 * The slip is paper for a rider: black on white, sized in millimetres, built
 * for a thermal head. This is a phone screen for a caller: 1080 pixels wide,
 * read in a chat, with the number they have to dial set as the largest thing
 * on it. Same order, same endpoint, different reader.
 *
 * WHAT IS MISSING IS SAID
 * -----------------------
 * Express checkout takes a name, a phone and a district and leaves the street
 * address for the call. So a picture with nothing where the address goes is
 * not a broken picture, it is the caller's first question — and it says so, in
 * the same amber the order screen uses for the same fact.
 *
 * NOTHING HERE TOUCHES THE PAGE. It takes an order and returns a canvas, so the
 * screen that shows the pictures and the picture itself can change separately.
 */

import { NEEDS_REASON, stageLabel, stageTone, payMethod } from './order-stages.js';

/* The picture's own measurements. Not the panel's type scale: that one is for
   a screen somebody sits at, and this is 1080 pixels that will be shown about
   390 wide in a chat — so everything here is roughly 2.75 times the size it is
   read at. The smallest label lands near 9px on a phone, and nothing a caller
   has to read aloud to a customer is under 12. */
const W = 1080;
const PAD = 72;
const INNER = W - PAD * 2;
const RIGHT = W - PAD;

/* A canvas cannot read a custom property, so the tokens are restated — by
   name, so a change in _variables.css has somewhere obvious to be repeated. */
const INK = '#101314';      // --text-primary
const SECOND = '#414B47';   // --text-secondary
const MUTED = '#667069';    // --text-muted
const HAIR = '#E5E9E7';     // --border-hairline
const LINK = '#0E7C99';     // --link
const CYAN = '#1BB4D4';     // --gr-cyan   } the brand gradient, as a rule under
const LIME = '#9ACD3C';     // --gr-lime   } the header and nowhere else
const GOLD = '#C9A24B';     // --gr-gold-accent
const AMBER = '#8A6D22';    // --gold-ink, what .akv__missing is written in
const PAID = '#1A7F37';     // the green .apill--ok carries

/* The four tones order-stages.js hands out, flattened onto white. The panel
   paints these as a translucent wash; a picture has no page behind it to wash
   over, so each is the colour that wash comes to. */
const TONES = {
  wait: { bg: '#EEF0EF', fg: SECOND },
  info: { bg: '#E1F2F8', fg: LINK },
  ok:   { bg: '#E4F3E7', fg: PAID },
  bad:  { bg: '#FBE6E6', fg: '#B4232A' },
};

/* The two boxed notices. Amber is something for the caller to do; red is a
   reason not to make the call at all. */
const ASK = { bg: '#FBF4E3', edge: '#E9D7A8', fg: AMBER };
const STOP = { bg: TONES.bad.bg, edge: '#F1C4C4', fg: TONES.bad.fg };

/* The same stacks the stylesheet names. Inter has no Bengali and no taka sign,
   so "৳" and anything a customer typed in Bangla fall through to the
   self-hosted Noto face — but only if it has been LOADED first. See
   loadFonts(): a canvas does not wait for a webfont the way a paragraph does,
   it draws with whatever is ready and never repaints. */
const BODY = 'Inter, "Noto Sans Bengali", "Noto Kufi Arabic", system-ui, -apple-system, sans-serif';
const DISPLAY = `"Clash Display", "General Sans", ${BODY}`;

/* Every style the picture uses, in one table. `lh` is the line box for text
   that can wrap; a style without one is only ever a single line. */
const T = {
  brand:      { weight: 600, size: 52, family: DISPLAY, color: INK },
  kicker:     { weight: 500, size: 28, color: MUTED },
  label:      { weight: 700, size: 24, color: MUTED, spacing: 3 },
  number:     { weight: 700, size: 44, color: INK },
  meta:       { weight: 500, size: 28, color: SECOND },
  pill:       { weight: 700, size: 24, spacing: 2 },
  name:       { weight: 700, size: 56, lh: 72, color: INK },
  // The one thing on the picture somebody has to copy by hand, digit by digit.
  phone:      { weight: 700, size: 80, lh: 100, color: INK },
  body:       { weight: 500, size: 40, lh: 56, color: INK },
  place:      { weight: 700, size: 40, lh: 56, color: INK },
  note:       { weight: 500, size: 34, lh: 48, color: SECOND },
  notice:     { weight: 600, size: 32, lh: 46, color: AMBER },
  qty:        { weight: 700, size: 40, color: LINK },
  item:       { weight: 600, size: 40, lh: 54, color: INK },
  sum:        { weight: 600, size: 40, color: INK },
  // The pack size. Heavier than a caption has any right to be, because "which
  // size" is the detail a customer corrects most often on the call.
  sub:        { weight: 600, size: 32, lh: 46, color: SECOND },
  row:        { weight: 500, size: 36, lh: 58, color: SECOND },
  rowSum:     { weight: 600, size: 36, color: INK },
  totalLabel: { weight: 700, size: 24, spacing: 3, color: 'rgba(255, 255, 255, .8)' },
  totalHow:   { weight: 500, size: 32, color: '#FFFFFF' },
  total:      { weight: 700, size: 84, color: '#FFFFFF' },
  foot:       { weight: 500, size: 24, color: MUTED },
};

/* ---- The pen ------------------------------------------------------------ */

const fontOf = (s, size = s.size) => `${s.weight} ${size}px ${s.family || BODY}`;

function use(ctx, s, size) {
  ctx.font = fontOf(s, size);
  // Not every engine has it. Where it is missing the small capitals are set
  // without tracking, which nobody reading an order will notice.
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${s.spacing || 0}px`;
}

function width(ctx, str, s, size) {
  use(ctx, s, size);
  return ctx.measureText(str).width;
}

function put(ctx, str, x, baseline, s, { align = 'left', size, color } = {}) {
  use(ctx, s, size);
  ctx.fillStyle = color || s.color;
  ctx.textAlign = align;
  ctx.fillText(str, x, baseline);
}

/**
 * Where the baseline sits inside a line box that starts at `top`.
 *
 * Centred on the capitals rather than on the em box: a line of digits or
 * capitals set by the em sits visibly low in its row, and half of what this
 * picture prints is digits. Bengali rides the same baseline with its matras
 * above and below, which is what the generous `lh` values are for.
 */
const base = (top, s) => top + s.lh / 2 + s.size * 0.35;

/** The largest size, at or under the style's own, at which `str` fits `max`. */
function fit(ctx, str, s, max, floor = 22) {
  let size = s.size;
  while (size > floor && width(ctx, str, s, size) > max) size -= 2;
  return size;
}

/**
 * Split by what a reader would call a character.
 *
 * Only reached for a single word wider than its column — an address typed
 * without spaces, a pasted link. Cutting that by code unit would land inside a
 * Bengali conjunct or halve an emoji, and the two halves each draw as a box.
 */
function graphemes(str) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str)]
      .map((part) => part.segment);
  }
  return [...str];
}

/** Break `str` into lines no wider than `max`, in the font already set. */
function wrap(ctx, str, max) {
  const lines = [];

  // A customer who pressed Enter in the notes box meant it.
  for (const para of String(str).split(/\r?\n/)) {
    let line = '';

    for (const word of para.trim().split(/\s+/).filter(Boolean)) {
      const longer = line ? `${line} ${word}` : word;
      if (ctx.measureText(longer).width <= max) { line = longer; continue; }

      if (line) lines.push(line);
      line = '';

      for (const g of graphemes(word)) {
        if (line && ctx.measureText(line + g).width > max) { lines.push(line); line = g; }
        else line += g;
      }
    }

    if (line) lines.push(line);
  }

  return lines;
}

/** Wrapped text in a column. Returns where the next thing may start. */
function block(ctx, str, x, top, max, s, opts) {
  use(ctx, s);
  const lines = wrap(ctx, str, max);
  lines.forEach((line, i) => put(ctx, line, x, base(top + i * s.lh, s), s, opts));
  return top + lines.length * s.lh;
}

/* arcTo rather than roundRect(): the newer call is missing from the browsers
   on exactly the three-year-old phones a shop's back office runs on, and a
   picture with square corners there would be a picture that looks unfinished
   only for the people least able to say why. */
function box(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function rule(ctx, y) {
  ctx.fillStyle = HAIR;
  ctx.fillRect(PAD, y, INNER, 2);
}

/**
 * Something the caller has to know before they dial, boxed.
 *
 * Amber by default and not red, for the reason the order screen gives about a
 * missing address: nothing is broken, something is outstanding. Red is kept
 * for the one case where the right move is to put the phone down.
 */
function notice(ctx, str, top, tone = ASK) {
  const padX = 28;
  const padY = 20;

  use(ctx, T.notice);
  const lines = wrap(ctx, str, INNER - padX * 2);
  const height = lines.length * T.notice.lh + padY * 2;

  box(ctx, PAD, top, INNER, height, 16, tone.bg, tone.edge);
  lines.forEach((line, i) =>
    put(ctx, line, PAD + padX, base(top + padY + i * T.notice.lh, T.notice), T.notice,
      { color: tone.fg }));

  return top + height;
}

/* ---- The words ---------------------------------------------------------- */

const taka = (n) => `৳ ${Number(n || 0).toLocaleString('en-BD')}`;

function when(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 01712345678 → 01712-345678.
 *
 * Eleven digits in one run are easy to lose your place in while dialling from
 * a picture, and the operator-then-number split is how a Bangladeshi mobile is
 * said aloud. Only that one shape is touched — the one OrderService normalises
 * every checkout to. Anything else was typed by a person into the panel and is
 * printed exactly as they left it, because a "tidied" number that has become a
 * different number is worse than an untidy one.
 */
function phone(raw) {
  const s = String(raw || '').trim();
  return /^01\d{9}$/.test(s) ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
}

/**
 * "Gulshan, Dhaka" — or just "Dhaka" when the thana is the district said
 * twice, which is how plenty of Dhaka addresses are typed.
 */
function placeLine(d) {
  const area = String(d.area || '').trim();
  const district = String(d.district || '').trim();
  if (!area || area.toLowerCase() === district.toLowerCase()) return district;
  return district ? `${area}, ${district}` : area;
}

const unitsIn = (o) =>
  (Array.isArray(o.items) ? o.items : []).reduce((n, i) => n + (Number(i.qty) || 0), 0);

/* ---- The picture -------------------------------------------------------- */

/**
 * Draw the order from the top down and return how tall it came to.
 *
 * Read it in the order a call goes: who am I ringing, where is it going, what
 * did they ask for, what does it cost.
 */
function paint(ctx, o, { logo, now }) {
  const c = o.customer || {};
  const d = o.delivery || {};
  const t = o.totals || {};
  const items = Array.isArray(o.items) ? o.items : [];

  ctx.textBaseline = 'alphabetic';

  /* ---- Whose order this is, and which one ---- */
  let y = 64;
  const MARK = 104;

  // Without the mark the wordmark simply starts at the margin. A logo that
  // failed to load is not a reason to hold up a confirmation call.
  if (logo) ctx.drawImage(logo, PAD, y, MARK, MARK);
  const brandX = logo ? PAD + MARK + 24 : PAD;
  put(ctx, 'GulfRabit', brandX, y + 58, T.brand);
  put(ctx, 'Order summary', brandX, y + 98, T.kicker);

  // The order number takes whatever the wordmark left. Shrunk to fit rather
  // than cut: this is the reference customer care reads back to the shop, and
  // a truncated reference is the wrong order.
  const taken = brandX + width(ctx, 'GulfRabit', T.brand) + 40;
  const no = String(o.orderNumber || '');
  put(ctx, 'ORDER NO.', RIGHT, y + 30, T.label, { align: 'right' });
  put(ctx, no, RIGHT, y + 86, T.number,
    { align: 'right', size: fit(ctx, no, T.number, RIGHT - taken) });

  y += MARK + 36;

  const gradient = ctx.createLinearGradient(PAD, 0, RIGHT, 0);
  gradient.addColorStop(0, CYAN);
  gradient.addColorStop(1, LIME);
  box(ctx, PAD, y, INNER, 6, 3, gradient);
  y += 6 + 36;

  /* ---- Where it has got to ----
     Always drawn, not only when something is wrong. A picture outlives the
     moment it was made in: one saved on Monday and found again on Thursday
     should say "Placed" where it could have said "Cancelled", so that the
     absence of a warning is itself a statement. */
  const tone = TONES[stageTone(o.status)] || TONES.wait;
  const stageName = String(stageLabel(o.status) || '');
  const stage = stageName.toUpperCase();
  const pillW = width(ctx, stage, T.pill) + 44;
  box(ctx, PAD, y, pillW, 52, 26, tone.bg);
  put(ctx, stage, PAD + 22, y + 35, T.pill, { color: tone.fg });
  // "Ordered", not "Placed": on a new order the pill beside it already says
  // PLACED, and the same word twice on one line reads as a stutter.
  if (o.placedAt) put(ctx, `Ordered ${when(o.placedAt)}`, RIGHT, y + 36, T.meta, { align: 'right' });
  y += 52 + 40;

  /* An order that has ended is the one picture that must not be read as a job.
     The pill says so, but a pill is small and this is going to somebody whose
     next move is to dial — so it is said again, in a sentence, above the name
     they would otherwise ring. */
  const ended = NEEDS_REASON.includes(o.status);
  if (ended) {
    y = notice(ctx, `${stageName} — this order is not waiting to be confirmed.`, y, STOP) + 40;
  }

  // A pre-order is the one thing about an order the customer may not have
  // taken in when they pressed the button, and the call is the last chance to
  // say it before they start waiting. Not on an ended order: there is no wait
  // left to warn anybody about.
  if (o.shipsOn && !ended) {
    const day = new Date(`${o.shipsOn}T00:00:00`)
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    y = notice(ctx, o.preorderDue
      ? `Pre-order — the shipment was due ${day}.`
      : `Pre-order — it cannot ship before ${day}. Tell the customer about the wait.`, y) + 40;
  }

  /* ---- Who to ring ---- */
  put(ctx, 'CUSTOMER', PAD, y + 24, T.label);
  y += 24 + 14;
  y = block(ctx, String(c.name || '').trim() || 'No name given', PAD, y, INNER, T.name);

  // An erased customer has no number left on the order. Said, at the same
  // size, rather than leaving a gap where the largest thing on the picture
  // is supposed to be.
  const dial = phone(c.phone) || 'No phone number';
  put(ctx, dial, PAD, base(y, T.phone), T.phone, { size: fit(ctx, dial, T.phone, INNER) });
  y += T.phone.lh + 32;

  rule(ctx, y);
  y += 2 + 40;

  /* ---- Where it is going ---- */
  put(ctx, 'DELIVER TO', PAD, y + 24, T.label);
  y += 24 + 16;

  const street = String(d.address || '').trim();
  y = street
    ? block(ctx, street, PAD, y, INNER, T.body)
    : notice(ctx, 'Street address not recorded yet — ask for it on this call.', y + 6) + 12;

  const place = placeLine(d);
  if (place) y = block(ctx, place, PAD, y, INNER, T.place);

  // What the customer typed into the notes box at checkout, with a bar beside
  // it so it reads as their words and not as part of the address above.
  const said = String(d.notes || '').trim();
  if (said) {
    y += 18;
    const top = y;
    y = block(ctx, `Note: ${said}`, PAD + 28, y, INNER - 28, T.note);
    ctx.fillStyle = GOLD;
    ctx.fillRect(PAD, top + 8, 6, y - top - 16);
  }

  y += 36;
  rule(ctx, y);
  y += 2 + 40;

  /* ---- What they asked for ---- */
  const units = unitsIn(o);
  put(ctx, `ORDER · ${units} ITEM${units === 1 ? '' : 'S'}`, PAD, y + 24, T.label);
  y += 24 + 20;

  // Two columns sized from what is in them, so "12 ×" and "৳ 1,24,500" get
  // the room they need and the product name gets everything else.
  const qtyW = Math.max(0, ...items.map((i) => width(ctx, `${i.qty} ×`, T.qty))) + 24;
  const sumW = Math.max(0, ...items.map((i) => width(ctx, taka(i.lineTaka), T.sum))) + 36;

  items.forEach((i, n) => {
    if (n) {
      y += 20;
      rule(ctx, y);
      y += 2 + 20;
    }

    const first = base(y, T.item);
    put(ctx, `${i.qty} ×`, PAD, first, T.qty);
    put(ctx, taka(i.lineTaka), RIGHT, first, T.sum, { align: 'right' });
    y = block(ctx, String(i.title || '').trim() || 'Unnamed product',
      PAD + qtyW, y, INNER - qtyW - sumW, T.item);

    // "each" only when there is more than one. On a single unit it is the line
    // total printed twice, and two identical figures read as two charges.
    const sub = [
      String(i.variant || '').trim(),
      Number(i.qty) > 1 ? `${taka(i.unitTaka)} each` : '',
    ].filter(Boolean).join(' · ');
    if (sub) y = block(ctx, sub, PAD + qtyW, y, INNER - qtyW, T.sub);
  });

  if (!items.length) y = block(ctx, 'No items on this order.', PAD, y, INNER, T.note);

  y += 30;
  rule(ctx, y);
  y += 2 + 16;

  /* ---- What it comes to ---- */
  const row = (label, value) => {
    const room = INNER - width(ctx, value, T.rowSum) - 32;
    put(ctx, label, PAD, base(y, T.row), T.row, { size: fit(ctx, label, T.row, room) });
    put(ctx, value, RIGHT, base(y, T.row), T.rowSum, { align: 'right' });
    y += T.row.lh;
  };

  row('Subtotal', taka(t.subtotalTaka));
  if (t.discountTaka) {
    row(`Discount${o.promoCode ? ` (${o.promoCode})` : ''}`, `− ${taka(t.discountTaka)}`);
  }
  // The promise sits beside the price, because "when will it come" is the
  // question that follows "how much" on every one of these calls.
  row(`Delivery${d.eta ? ` · ${d.eta}` : ''}`, t.deliveryTaka ? taka(t.deliveryTaka) : 'Free');

  y += 22;

  /* The figure the call exists to agree on. One rule decides what it says, and
     it is the slip's rule: an order is either paid or it is collected at the
     door. A prepaid order turns the whole box green and says so in words,
     because a customer told to have cash ready for something they have already
     paid for is a customer who rings back angry.

     `paid` can only mean in advance. OrderService never sets it and neither
     does a delivery — only a gateway callback does — so cash handed to a rider
     leaves the order `pending`, and "paid" on this picture is never a guess
     about what happened at a door.

     "To pay" is a promise about the future, so it is only made while the
     parcel still has one. Delivered, cancelled, returned or spam, the figure
     is what the order came to and is labelled as that. */
  const paid = o.paymentStatus === 'paid';
  const over = ended || o.status === 'delivered';
  const method = payMethod(o.paymentMethod);
  const how = paid
    ? `${method} · nothing to collect`
    : ['failed', 'refunded'].includes(o.paymentStatus)
      ? `${method} · payment ${o.paymentStatus}`
      : method;

  const HEIGHT = 176;
  const sum = taka(t.totalTaka);
  const sumSize = fit(ctx, sum, T.total, INNER * 0.56, 48);
  const sumWidth = width(ctx, sum, T.total, sumSize);

  // An ended order's total is set back to grey: still legible, no longer the
  // loudest thing on a picture whose point is that nothing is owed.
  box(ctx, PAD, y, INNER, HEIGHT, 28, paid ? PAID : ended ? SECOND : INK);
  put(ctx, paid ? 'PAID IN ADVANCE' : over ? 'ORDER TOTAL' : 'TOTAL TO PAY',
    PAD + 40, y + 72, T.totalLabel);
  put(ctx, how, PAD + 40, y + 124, T.totalHow,
    { size: fit(ctx, how, T.totalHow, INNER - 80 - sumWidth - 32) });
  put(ctx, sum, RIGHT - 40, y + 88 + sumSize * 0.35, T.total, { align: 'right', size: sumSize });
  y += HEIGHT;

  /* ---- When this was true ----
     The picture is a copy and the order is not. An address corrected ten
     minutes after this was sent is not corrected here, so the picture carries
     the time it was made and the caller can tell an old one from a new one. */
  y += 40;
  put(ctx, `As of ${when(now)}`, PAD, y + 24, T.foot);
  put(ctx, 'gulfrabit.com', RIGHT, y + 24, T.foot, { align: 'right' });

  return y + 24 + 56;
}

/**
 * The order as a canvas, 1080 wide and as tall as it needs to be.
 *
 * PAINTED TWICE. The height is not known until every line has been wrapped,
 * and a canvas cannot be made taller without being wiped. So the order goes
 * once onto a scrap to find out how tall it is, then once for real. Two passes
 * through the same function cannot disagree about where a line broke — which
 * a separate measuring routine, kept in step by hand, eventually would.
 *
 * @param {object} order                       the `data` of GET /orders/{no}
 * @param {object} [o]
 * @param {HTMLImageElement|null} [o.logo]     from loadLogo(), or nothing
 * @param {Date} [o.now]                       when the picture is being made
 * @returns {HTMLCanvasElement}
 */
export function drawOrderImage(order, { logo = null, now = new Date() } = {}) {
  const scrap = document.createElement('canvas');
  scrap.width = W;
  scrap.height = 16;
  const height = Math.ceil(paint(scrap.getContext('2d'), order, { logo, now }));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  // Opaque white, painted — not the canvas's own transparency. A transparent
  // PNG dropped into a dark-mode chat is black text on a black bubble.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, height);
  paint(ctx, order, { logo, now });

  return canvas;
}

/**
 * The canvas as a PNG, or null when the browser could not make one.
 *
 * PNG, not JPEG: this is flat colour and sharp type, which is what PNG is
 * small at and what JPEG smears. Null is a real answer — an order long enough
 * to pass the browser's canvas limit encodes to nothing — and the caller is
 * expected to say so rather than hand somebody an empty file.
 *
 * @returns {Promise<Blob|null>}
 */
export function toPng(canvas) {
  return new Promise((resolve) => { canvas.toBlob(resolve, 'image/png'); });
}

/** What the picture says, for somebody who cannot see it. */
export function describe(o) {
  const units = unitsIn(o);
  const paid = o.paymentStatus === 'paid';

  return `Order ${o.orderNumber} — ${o.customer?.name || 'no name'}, `
    + `${phone(o.customer?.phone) || 'no phone number'}. `
    + `${units} item${units === 1 ? '' : 's'}, ${taka(o.totals?.totalTaka)} `
    + `${paid ? 'paid in advance' : 'to pay'}.`;
}

/**
 * The file's name: the order number, and nothing a filesystem would refuse.
 *
 * Named for the order rather than the customer, so a folder of these sorts the
 * way the orders list does and a name never ends up in a file path.
 */
export function fileName(o) {
  return `${String(o.orderNumber || 'order').replace(/[^\w.-]+/g, '-')}.png`;
}

/* ---- Before the first picture ------------------------------------------- */

/* Everything the picture prints that does not come from an order. */
const FIXED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 ৳ × − · — . , : ( )';

function wordsOf(o) {
  return [
    o.orderNumber, o.customer?.name, o.promoCode,
    o.delivery?.address, o.delivery?.area, o.delivery?.district, o.delivery?.notes, o.delivery?.eta,
    ...(Array.isArray(o.items) ? o.items : []).flatMap((i) => [i.title, i.variant]),
  ].filter(Boolean).join(' ');
}

/**
 * Have the fonts ready before anything is drawn with them.
 *
 * A paragraph in a page waits for its webfont and repaints when it lands. A
 * canvas does neither: fillText() uses whatever is loaded at that instant and
 * the result is pixels. Drawn too early, the first picture of the day would
 * come out in the system face — and, worse, with every "৳" as an empty box on
 * a machine with no Bengali font installed.
 *
 * The orders' own text is passed along because the faces are split by
 * unicode-range: the browser fetches the Bengali file only if it is shown
 * Bengali to set, and the taka sign on every price guarantees it is.
 *
 * Bounded, and never fatal. A font host that is slow or blocked costs a few
 * seconds and a plainer typeface, not the picture.
 */
export async function loadFonts(orders) {
  if (!document.fonts?.load) return;

  const sample = `${FIXED} ${orders.map(wordsOf).join(' ')}`;
  const wanted = [500, 600, 700].map((weight) =>
    document.fonts.load(`${weight} 40px ${BODY}`, sample));
  wanted.push(document.fonts.load(fontOf(T.brand), 'GulfRabit'));

  await Promise.race([
    Promise.allSettled(wanted),
    new Promise((resolve) => { setTimeout(resolve, 4000); }),
  ]);
}

/**
 * The rabbit mark, or null.
 *
 * Same-origin on purpose. A picture drawn from another host without CORS
 * taints the canvas, and a tainted canvas draws perfectly well and then
 * refuses to be exported — so every picture would render and none could be
 * saved. That is also why the product photographs are not on this: they are a
 * path snapshotted onto the order line, and nothing promises where it points.
 */
export function loadLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/assets/logo/gulfrabit-mark-240.png';
  });
}
