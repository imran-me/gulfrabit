/**
 * site-config.js — the handful of values that differ between "the code" and
 * "this shop's accounts". Everything here is safe to commit: an ad platform's
 * pixel id is public by design (it ships in the page to every visitor). The
 * matching ACCESS TOKEN is not, and must never appear in this file — it lives
 * in the server's .env and is used only by the Conversions API forwarder.
 *
 * Empty values mean "not configured", and every consumer is required to no-op
 * rather than guess. That is deliberate: a half-configured tracker that fires
 * into the void is worse than one that is plainly off, because it looks like
 * it is working.
 */

export const CONFIG = {
  /**
   * Meta (Facebook) Pixel ID — the 15-16 digit number from Events Manager.
   * Leave empty and no pixel script is injected at all.
   *
   * // TODO(merchant): paste the Pixel ID here before the first ad runs.
   */
  metaPixelId: '',

  /**
   * Where the browser mirrors each event for server-side forwarding.
   *
   * Browser-only tracking loses a large share of events to iOS tracking
   * prevention, ad blockers and in-app browsers; the Conversions API exists to
   * recover them. Both sides send the same event_id and Meta deduplicates.
   *
   * // TODO(backend): implement this route — it must attach the access token
   * // server-side and POST to https://graph.facebook.com/v21.0/<pixel>/events.
   * // Until it exists the fetch 404s and is swallowed, which is why the pixel
   * // still works on its own today.
   */
  capiEndpoint: '/api/track',

  /** ISO currency for ad platform value reporting. */
  currency: 'BDT',
};
