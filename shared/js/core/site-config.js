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
   * The route is modules/marketing (TrackController). It answers 204 until
   * META_PIXEL_ID and META_CAPI_TOKEN are set in the server's .env — the
   * token lives there and ONLY there. On a static host the fetch 404s once
   * and the circuit breaker stops calling; the pixel works alone.
   */
  capiEndpoint: '/api/track',

  /**
   * Social profiles. An empty string hides that icon in the footer entirely.
   *
   * They used to be href="#" — three links on every page of the site that
   * said "we are on Instagram" and went nowhere. A missing icon is honest; a
   * dead one is not. Fill one in and it appears, no deploy needed beyond the
   * push.
   *
   * // TODO(merchant): paste the profile URLs once the accounts exist.
   */
  social: {
    instagram: '',
    facebook: 'https://www.facebook.com/profile.php?id=61582429974835',
    linkedin: '',
  },

  /**
   * The helpline shown in the announce strip on every page, with its hours.
   * The strongest trust signal a COD shop has is a number a human answers —
   * and the worst thing it can show is one nobody does. Empty renders
   * nothing, same contract as everything else here.
   *
   * Hours are still unset — the strip shows the number alone until the
   * merchant decides what to promise.
   */
  phone: '01894 715151',
  supportHours: '',   // e.g. '10:00–22:00' — shown beside the number

  /**
   * WhatsApp number in international format, digits only or formatted —
   * non-digits are stripped (e.g. '8801XXXXXXXXX'). Empty hides the floating
   * chat bubble on every page, exactly like the socials above.
   *
   */
  whatsapp: '8801894715151',

  /** ISO currency for ad platform value reporting. */
  currency: 'BDT',
};
