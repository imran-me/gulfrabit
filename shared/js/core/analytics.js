/**
 * analytics.js — one funnel event, sent two ways.
 *
 * WHY A LAYER RATHER THAN fbq() CALLS AT THE CALL SITES
 * -----------------------------------------------------
 * Three reasons, all of which bit somebody before this file existed:
 *
 *  1. Deduplication. The same purchase must reach Meta from the browser AND
 *     from the server, or iOS tracking prevention and in-app browsers quietly
 *     eat a large share of conversions. Meta merges the two only when both
 *     carry the same `event_id`. Generating that in one place is the only way
 *     it is ever actually the same.
 *
 *  2. Attribution outlives the landing URL. A visitor lands on
 *     ?utm_campaign=decor-aug, taps around, and buys four pages later — by
 *     which point the URL has no UTMs on it. They are captured on FIRST touch
 *     and kept for the session, so Purchase still knows which ad paid for it.
 *
 *  3. Being off must be the safe state. With no pixel id configured this file
 *     injects no script, opens no socket and throws nothing. A shop that has
 *     not set up ads yet behaves exactly as it did before.
 *
 * Nothing here is allowed to break a page. Every entry point is wrapped: an
 * analytics failure must never be the reason an order cannot be placed.
 */

import { CONFIG } from './site-config.js';
import { storage } from './storage.js';

const ATTRIBUTION_KEY = 'attribution';

/* ---- Anonymous identity ------------------------------------------------ */
/* Two random ids, so the shop's own dashboard can answer "how many people
 * came" and "where did they leave" — questions Meta cannot answer, because it
 * never sees the pages nobody converted on.
 *
 * They identify NOTHING about the person: no name, no phone, no IP, no
 * fingerprint. A cleared browser is a new visitor and a second device is a
 * second visitor, so the count is an honest lower bound on people rather than
 * a headcount. That is the right trade for a shop with no need to know who
 * anyone is, and it is why these are minted here rather than derived from
 * anything about the client.
 */
const VISITOR_KEY = 'visitor-id';
const SESSION_KEY = 'session';

/* 30 minutes idle ends a session — the window every analytics tool uses, so
 * the numbers are comparable to anything the merchant reads elsewhere. Without
 * it a returning shopper is one endless visit and every drop-off rate is
 * wrong. */
const SESSION_IDLE_MS = 30 * 60 * 1000;

/** Stable for the life of this browser. */
function visitorId() {
  let id = storage.get(VISITOR_KEY, null);
  if (!id) {
    id = newEventId();
    storage.set(VISITOR_KEY, id);
  }
  return id;
}

/**
 * This visit. Rotates after SESSION_IDLE_MS of no events.
 *
 * `seenAt` is bumped on every call rather than only on the first, so a session
 * ends 30 minutes after the last thing somebody did, not 30 minutes after they
 * arrived — otherwise a long, engaged browse gets cut in half and reported as
 * two visits that each abandoned.
 */
function sessionId() {
  const now = Date.now();
  const prev = storage.get(SESSION_KEY, null);

  if (prev && prev.id && typeof prev.seenAt === 'number' && now - prev.seenAt < SESSION_IDLE_MS) {
    storage.set(SESSION_KEY, { id: prev.id, seenAt: now });
    return prev.id;
  }

  const id = newEventId();
  storage.set(SESSION_KEY, { id, seenAt: now });
  return id;
}

let ready = false;
/** Set once the CAPI endpoint has failed; stops retrying for this page load. */
let capiDown = false;

/* ---- Boot -------------------------------------------------------------- */

/**
 * Capture attribution and, if configured, load the pixel.
 * Safe to call on every page; the pixel script is injected at most once.
 */
export function initAnalytics() {
  try {
    // THE PANEL IS NOT A SHOPPER.
    //
    // Admin pages load main.js like every other page, so staff opening the
    // orders screen fired a PageView — into the same pixel the ads optimise
    // against, and (since the events are now kept) into the top of the
    // merchant's own funnel. Both readings are corrupted the same way: a shop
    // whose team browses all day looks like it has plenty of visitors who
    // never buy, and the drop-off from PageView to ViewContent is reported as
    // worse than it is.
    //
    // Keyed on the shell container the assembler puts on every admin page and
    // nowhere else, rather than on the URL: the panel is reachable both as
    // /admin/... and as /modules/<x>/<page>.html, and a path test would miss
    // half of it — silently, which is the whole problem with path tests.
    if (document.querySelector('[data-admin-shell]')) return;

    captureAttribution();
    const pixelId = pagePixelId();
    if (!pixelId) return;
    loadPixel(pixelId);

    // PageView is sent by the base-code snippet in <head>, not from here.
    // It has to be IN THE HTML: Events Manager's install check and the Event
    // Setup Tool scan the source for `init` followed by `track('PageView')`,
    // and their runtime check runs headless, where fbevents.js sends no
    // beacon at all. A PageView that only exists once this module has
    // resolved is invisible to both — which is what "a pixel wasn't detected
    // on this website" means. Firing it up there also catches the visitor who
    // bounces before the module graph finishes.
    //
    // What is left for this file is the SERVER half, reusing the id the
    // snippet minted. The same id on both copies is the whole dedup
    // mechanism; sending our own PageView here would be the double count the
    // snippet was written to avoid.
    const inlineId = window.__grPageViewId;
    if (inlineId) {
      mirrorToServer('PageView', {}, inlineId);
    } else {
      // No snippet on this page — an admin page, or a build predating it.
      // Fall back to the old behaviour rather than lose the event.
      track('PageView');
    }
  } catch (err) {
    console.warn('[analytics] init skipped', err);
  }
}

/**
 * The pixel this page carries, or '' for none.
 *
 * The block in <head> says so on its first line, <meta name="gr-meta-pixel">,
 * and that is the answer whenever it is there: the server rewrites that block
 * when the id is changed in Admin > Pixel setup, so it can be newer than
 * site-config.js — and an EMPTY value means the panel switched the pixel off.
 * Falling back to site-config.js in that case would load the pixel the
 * merchant had just turned off.
 *
 * Only a page with no block at all (one built before it existed) falls back.
 */
function pagePixelId() {
  const declared = document.querySelector('meta[name="gr-meta-pixel"]');
  return declared ? declared.content.trim() : CONFIG.metaPixelId;
}

/** Meta's standard snippet, minus the <noscript> pixel (it cannot dedupe). */
function loadPixel(id) {
  if (window.fbq) { ready = true; return; }

  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  window.fbq('init', id);
  ready = true;
}

/* ---- Attribution ------------------------------------------------------- */

/**
 * First touch wins. A visitor who arrives from an ad and later re-enters from
 * a Google search should still be credited to the ad that introduced them —
 * and more practically, overwriting on every page view would attribute every
 * order to whatever the last internal link happened to carry.
 */
function captureAttribution() {
  if (storage.get(ATTRIBUTION_KEY, null)) return;

  const url = new URL(window.location.href);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  const found = {};
  for (const k of keys) {
    const v = url.searchParams.get(k);
    if (v) found[k] = v;
  }
  if (!Object.keys(found).length) return;

  found.landedAt = new Date().toISOString();
  found.landingPath = url.pathname;
  storage.set(ATTRIBUTION_KEY, found);
}

/** What the session was recruited by, or null. */
export function getAttribution() {
  return storage.get(ATTRIBUTION_KEY, null);
}

/* ---- Events ------------------------------------------------------------ */

/**
 * Fire one funnel event to the pixel and mirror it to the server.
 *
 * @param {string} name    a Meta standard event: ViewContent, AddToCart,
 *                         InitiateCheckout, Purchase.
 * @param {object} params  value / currency / content_ids / contents.
 * @returns {string|null}  the event_id, so a caller can store it on an order.
 */
export function track(name, params = {}) {
  const eventId = newEventId();
  // Currency rides along ONLY when there is a value for it to denominate.
  // Events Manager raises a diagnostic for a currency with no value, and
  // PageView — which has neither — would otherwise trip it on every page of
  // the site. Every value-bearing caller goes through productPayload() or
  // cartPayload(), both of which always set value, so this changes nothing
  // for them.
  const payload = params.value === undefined
    ? { ...params }
    : { currency: CONFIG.currency, ...params };

  try {
    if (ready && window.fbq) {
      window.fbq('track', name, payload, { eventID: eventId });
    }
  } catch (err) {
    console.warn('[analytics] pixel event failed', name, err);
  }

  mirrorToServer(name, payload, eventId);
  return eventId;
}

/**
 * The server half of the pair. keepalive so it survives the page being
 * replaced — Purchase fires at exactly the moment a checkout navigates, and
 * without it the request is cancelled and the conversion is lost.
 *
 * Failure is silent ON PURPOSE, and after the first one it stops trying for
 * the rest of the page. There is no backend route yet (see site-config.js), so
 * today the first call gets a 404 and the rest are never made. Without the
 * breaker every funnel event logs its own network error, and a console that
 * cries wolf on a working site is a console nobody reads during an outage.
 *
 * The flag is per page load, not persisted: a deploy that adds the route
 * should start working on the next page view, not after a cache clear.
 */
function mirrorToServer(name, params, eventId) {
  if (!CONFIG.capiEndpoint || capiDown) return;

  const body = JSON.stringify({
    event_name: name,
    event_id: eventId,
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: window.location.href,
    // Path separately from the full URL: the shop's own footprint report
    // groups by page, and grouping by a URL carrying a different utm string
    // on every row groups nothing.
    path: window.location.pathname,
    // document.referrer is '' for a direct visit; send null rather than an
    // empty string so "nobody sent them" and "we did not look" stay different
    // answers in the report.
    referrer: document.referrer || null,
    visitor_id: visitorId(),
    session_id: sessionId(),
    attribution: getAttribution(),
    custom_data: params,
  });

  try {
    fetch(CONFIG.capiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    })
      // A 404/501 RESOLVES, it does not reject — checking res.ok is the only
      // way to notice the route is absent.
      .then((res) => { if (!res.ok) capiDown = true; })
      .catch(() => { capiDown = true; });
  } catch {
    // Older browsers without keepalive support, offline, blocked — all fine.
    capiDown = true;
  }
}

function newEventId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* ---- Shapes ------------------------------------------------------------ */
/* Meta wants content_ids/contents in a particular shape and reports value
   against it. Building them here keeps the call sites readable and stops two
   pages disagreeing about what an id is. */

/** @param {{id:string, price:number}} product */
export function productPayload(product, qty = 1) {
  return {
    content_type: 'product',
    content_ids: [String(product.id)],
    content_name: product.title,
    contents: [{ id: String(product.id), quantity: qty, item_price: product.price }],
    value: Number((product.price * qty).toFixed(2)),
  };
}

/** @param {Array<{id:string, qty:number, price:number}>} items */
export function cartPayload(items, value) {
  return {
    content_type: 'product',
    content_ids: items.map((i) => String(i.id)),
    contents: items.map((i) => ({ id: String(i.id), quantity: i.qty, item_price: i.price })),
    num_items: items.reduce((n, i) => n + i.qty, 0),
    value: Number((value ?? items.reduce((s, i) => s + i.price * i.qty, 0)).toFixed(2)),
  };
}
