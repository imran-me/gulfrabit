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
    captureAttribution();
    if (!CONFIG.metaPixelId) return;
    loadPixel(CONFIG.metaPixelId);

    // PageView, explicitly. `fbq('init')` does NOT send one — Meta's own
    // snippet carries it as a separate second line, and dropping that line is
    // the single most common way a pixel install looks finished and reports
    // nothing.
    //
    // It is not optional garnish. PageView is what Events Manager checks to
    // say the pixel is live, what "people who visited your website" audiences
    // are built from, and what a traffic campaign optimises against. Without
    // it the first event a visitor can possibly generate is ViewContent on a
    // product page, so anyone who lands and bounces is invisible.
    //
    // Routed through track() rather than a bare fbq call so it gets an
    // event_id and is mirrored to the Conversions API like every other event
    // — otherwise the server copy would double-count instead of deduplicate.
    track('PageView');
  } catch (err) {
    console.warn('[analytics] init skipped', err);
  }
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
