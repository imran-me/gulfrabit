<?php

declare(strict_types=1);

namespace Modules\Marketing\Controllers;

use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Modules\Marketing\Models\TrackingEvent;
use Modules\Marketing\Services\VisitContext;
use Throwable;

/**
 * The server half of ad tracking: forward the browser's event to Meta's
 * Conversions API.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * The browser pixel alone loses a large share of events — iOS tracking
 * prevention, ad blockers, in-app browsers. Meta's answer is to send every
 * event twice, browser AND server, carrying the same `event_id` so the two
 * are merged rather than double-counted. analytics.js generates that id and
 * mirrors the event here; this controller's whole job is to pass it on with
 * the server-side matching data (IP, user agent, _fbp/_fbc cookies) the
 * browser cannot be trusted to report about itself.
 *
 * WHAT THIS DELIBERATELY IS NOT
 * -----------------------------
 * Not authenticated — every visitor's browser is a legitimate caller (the
 * route throttles instead). Not a proxy — only whitelisted, bounded fields
 * are forwarded, so this cannot be used to relay arbitrary payloads to a
 * third party under the shop's name. And never a reason a page breaks: the
 * response is 202 whether Meta answered or not; failures go to the log,
 * where a merchant's developer can see them, not to the customer.
 */
class TrackController extends Controller
{
    private const GRAPH_VERSION = 'v21.0';

    /** Meta rejects events older than 7 days; a skewed client clock must not cost the event. */
    private const MAX_AGE_SECONDS = 7 * 86400;

    /**
     * The events this endpoint accepts: the funnel, plus the four standard
     * events that sit beside it. Anything else is refused at validation.
     *
     * Kept in step with what the browser fires. An event the browser sends and
     * this list lacks is not a loud failure — the mirror has no Accept header,
     * so Laravel answers the validation error with a redirect, fetch follows
     * it, and the beacon reports success. The event is simply gone from Meta's
     * server copy and from the shop's own dashboard, which is how four events
     * were once added to the storefront and silently dropped here.
     */
    private const EVENTS = [
        'PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase',
        'AddToWishlist', 'Search', 'CompleteRegistration', 'Contact',
    ];

    /** The only custom_data keys forwarded. Everything else is dropped unread. */
    private const CUSTOM_DATA_KEYS = [
        'value', 'currency', 'content_ids', 'content_name', 'content_type',
        'contents', 'num_items',
        // Search's own field: what the customer typed, which is the one thing
        // that makes the event worth having.
        'search_string',
    ];

    public function __invoke(Request $request): JsonResponse
    {
        // VALIDATION COMES FIRST NOW, AND SO DOES RECORDING.
        //
        // This used to open by reading the Meta credentials and returning 204
        // when they were absent, so a shop without a Conversions API token
        // never even parsed the event. That was correct while the only purpose
        // of this endpoint was forwarding — and wrong the moment the shop
        // wanted its own copy, because the shop that most needs to see its
        // funnel is exactly the one that has not finished configuring Meta.
        $data = $request->validate([
            'event_name' => ['required', Rule::in(self::EVENTS)],
            'event_id'         => ['required', 'string', 'max:64'],
            'event_time'       => ['sometimes', 'nullable', 'integer'],
            'event_source_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'path'             => ['sometimes', 'nullable', 'string', 'max:512'],
            'referrer'         => ['sometimes', 'nullable', 'string', 'max:2048'],
            // Minted in the browser and opaque here on purpose: this endpoint
            // must never be able to turn one into a person.
            'visitor_id'       => ['sometimes', 'nullable', 'string', 'max:64'],
            'session_id'       => ['sometimes', 'nullable', 'string', 'max:64'],
            'custom_data'      => ['sometimes', 'nullable', 'array'],
            'attribution'      => ['sometimes', 'nullable', 'array', 'max:10'],
            'attribution.*'    => ['string', 'max:255'],
        ]);

        $pixelId = config('services.meta.pixel_id');
        $token   = config('services.meta.capi_token');

        // Clamp, don't trust: the browser's clock sets event_time, and a phone
        // running fast would post an event from the future, which Meta refuses.
        $now  = time();
        $time = (int) ($data['event_time'] ?? $now);
        $time = max(min($time, $now), $now - self::MAX_AGE_SECONDS);

        $event = array_filter([
            'event_name'       => $data['event_name'],
            'event_time'       => $time,
            'event_id'         => $data['event_id'],
            'event_source_url' => $data['event_source_url'] ?? null,
            'action_source'    => 'website',
            'user_data'        => $this->userData($request, $data['attribution'] ?? null, $time),
            'custom_data'      => $this->customData($data['custom_data'] ?? null),
        ]);

        $payload = array_filter([
            'data'            => [$event],
            'test_event_code' => config('services.meta.test_event_code') ?: null,
        ]);

        // Unconfigured is still a legitimate, permanent state — the shop before
        // its first Conversions API token. The difference is that the event is
        // now KEPT either way, and the row says which of the three things
        // happened rather than leaving the merchant to guess whether the
        // forwarder is off or broken.
        if (! $pixelId || ! $token) {
            $this->record($request, $data, $time, 'skipped');

            // Still a 2xx: analytics.js treats any non-ok response as "this
            // route does not exist" and stops calling for the rest of the page
            // load, which would cost the shop its own copy too.
            return response()->json(null, 204);
        }

        // Synchronous with a short timeout rather than queued: this shared
        // host runs no queue worker, and the caller is a keepalive beacon the
        // customer never waits on — four slow seconds here cost nobody
        // anything visible. Failures are logged and swallowed; tracking must
        // never be the reason a shop misbehaves.
        $status = 'sent';

        try {
            $response = Http::timeout(4)
                ->post(
                    sprintf('https://graph.facebook.com/%s/%s/events', self::GRAPH_VERSION, $pixelId),
                    $payload + ['access_token' => $token],
                );

            if ($response->failed()) {
                $status = 'failed';
                Log::warning('capi: Meta refused the event', [
                    'event'  => $data['event_name'],
                    'status' => $response->status(),
                    'body'   => mb_substr($response->body(), 0, 500),
                ]);
            }
        } catch (Throwable $e) {
            $status = 'failed';
            Log::warning('capi: Meta unreachable', ['error' => $e->getMessage()]);
        }

        // After the attempt, so the row records what actually happened rather
        // than what was intended. The forward is already wrapped, so nothing
        // above can prevent this line from running.
        $this->record($request, $data, $time, $status);

        return response()->json(['ok' => true], 202);
    }

    /**
     * Keep the shop's own copy of the event.
     *
     * WHY THE SHOP KEEPS ITS OWN
     * --------------------------
     * Meta reports on the ad. It cannot report on the pages nobody converted
     * on, because it never sees them — so "which step loses people" is a
     * question only the shop can answer about itself, and only if it kept the
     * events. It also means the answer to "is tracking working?" no longer
     * depends on a third-party dashboard or a browser extension.
     *
     * NEVER THROWS.
     * A tracking beacon must not be the reason a page misbehaves, and this
     * runs on every page load of every visitor. A full disk, a missing table
     * before the migration has run, a lock timeout — all of it is logged and
     * swallowed. The event is already on its way to Meta by this point; losing
     * the local copy is the cheapest possible failure here.
     *
     * @param array<string, mixed> $data
     */
    private function record(Request $request, array $data, int $time, string $capiStatus): void
    {
        // A CRAWLER IS NOT A SHOPPER.
        // Most bots never run JavaScript and so never reach this endpoint at
        // all; the ones that do would be counted as visits, inflating the top
        // of the funnel and making every drop-off below it look worse than it
        // is. Dropped rather than flagged: a column every query has to remember
        // to filter is a column half the queries will forget.
        //
        // Only the local copy is skipped. Meta runs its own filtering on the
        // forwarded event, and second-guessing it here would mean this shop
        // reporting a different number to Meta than Meta reports to itself.
        if ($this->looksAutomated((string) $request->userAgent())) {
            return;
        }

        try {
            $custom = $data['custom_data'] ?? [];
            $attr   = $data['attribution'] ?? [];

            // Poisha, from whatever the browser called taka. Rounded, not
            // truncated: a 460.00 that arrives as 459.999999 must not be
            // recorded as 45999, and money is integer everywhere in this
            // codebase for exactly this reason.
            $value = isset($custom['value']) && is_numeric($custom['value'])
                ? (int) round(((float) $custom['value']) * 100)
                : null;

            // Channel, landing page, device, product, search term - the
            // columns every Tracking report groups by. Resolved apart from the
            // row below because it reads the visit's earlier events, and it
            // never throws: a failed lookup costs those fields, not the event.
            $context = app(VisitContext::class)->resolve($request, $data);

            TrackingEvent::create([
                'visitor_id'   => $data['visitor_id'] ?? null,
                'session_id'   => $data['session_id'] ?? null,
                'event_name'   => $data['event_name'],
                'event_id'     => $data['event_id'] ?? null,
                'value_poisha' => $value,
                // Currency only where there is a value to denominate, matching
                // what analytics.js sends and what Events Manager expects.
                'currency'     => $value === null ? null : ($custom['currency'] ?? null),
                'path'         => $data['path'] ?? null,
                'source_url'   => $data['event_source_url'] ?? null,
                'referrer'     => $data['referrer'] ?? null,
                'content_ids'  => is_array($custom['content_ids'] ?? null) ? $custom['content_ids'] : null,
                'content_name' => is_string($custom['content_name'] ?? null)
                    ? mb_substr($custom['content_name'], 0, 255)
                    : null,
                'num_items'    => isset($custom['num_items']) && is_numeric($custom['num_items'])
                    ? (int) $custom['num_items']
                    : null,
                'utm_source'   => $attr['utm_source'] ?? null,
                'utm_medium'   => $attr['utm_medium'] ?? null,
                'utm_campaign' => $attr['utm_campaign'] ?? null,
                'utm_content'  => $attr['utm_content'] ?? null,
                'attribution'  => $attr ?: null,
                'capi_status'  => $capiStatus,
                // The browser's clock, already clamped by the caller, so the
                // dashboard and Meta agree about when something happened.
                'created_at'   => date('Y-m-d H:i:s', $time),
                'updated_at'   => date('Y-m-d H:i:s', $time),
            ] + $context);
        } catch (QueryException $e) {
            // 23000 is the SQL state for a constraint violation, which here can
            // only be the unique event_id: the same event arriving twice
            // because keepalive retried it, or somebody double-tapped Place
            // Order. The event is already recorded, so this is a success with
            // an unusual shape - logging it as a warning would train the
            // merchant's developer to ignore this log.
            if (($e->errorInfo[0] ?? null) !== '23000') {
                Log::warning('track: could not record the event locally', [
                    'event' => $data['event_name'] ?? '?',
                    'error' => $e->getMessage(),
                ]);
            }
        } catch (Throwable $e) {
            Log::warning('track: could not record the event locally', [
                'event' => $data['event_name'] ?? '?',
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Whether this user agent is a robot rather than a person.
     *
     * A conservative list of substrings that are unambiguous. Nothing here
     * matches a real browser, because the cost of a false positive is a real
     * customer who is invisible in the merchant's own report - strictly worse
     * than a crawler that slips through and is merely noise.
     *
     * HeadlessChrome is included, which means an automated check of this very
     * site does not appear in its own dashboard. That is the correct answer:
     * a smoke test is not a shopper either.
     */
    private function looksAutomated(string $agent): bool
    {
        if ($agent === '') {
            // No user agent at all is a script, not a browser. Every real one
            // sends it.
            return true;
        }

        static $needles = [
            'bot', 'crawler', 'spider', 'crawling',
            'facebookexternalhit', 'facebookcatalog', 'meta-externalagent',
            'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
            'yandex', 'sogou', 'exabot', 'ia_archiver', 'ahrefs', 'semrush',
            'headlesschrome', 'phantomjs', 'puppeteer', 'playwright',
            'python-requests', 'curl/', 'wget', 'go-http-client',
            'lighthouse', 'pingdom', 'gtmetrix', 'uptimerobot',
        ];

        $agent = mb_strtolower($agent);

        foreach ($needles as $needle) {
            if (str_contains($agent, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * The matching signals Meta uses to tie a server event to a person.
     *
     * IP and user agent come from the request itself — the one place the
     * browser cannot lie about them usefully. _fbp/_fbc are Meta's own
     * first-party cookies; when _fbc is absent but the visit carried an
     * fbclid (captured by analytics.js at first touch), the cookie is
     * reconstructed in Meta's documented format, which is what recovers
     * attribution in browsers that blocked the cookie write.
     *
     * @param  array<string, string>|null $attribution
     * @return array<string, string>
     */
    private function userData(Request $request, ?array $attribution, int $time): array
    {
        $fbc = $request->cookie('_fbc');

        if (! $fbc && ! empty($attribution['fbclid'])) {
            $fbc = sprintf('fb.1.%d.%s', $time * 1000, $attribution['fbclid']);
        }

        return array_filter([
            'client_ip_address' => $request->ip(),
            'client_user_agent' => (string) $request->userAgent(),
            'fbp'               => $request->cookie('_fbp'),
            'fbc'               => $fbc,
        ]);
    }

    /**
     * Whitelist, never forward wholesale: this endpoint must not be usable as
     * a relay for arbitrary data wearing the shop's pixel id.
     *
     * @param  array<string, mixed>|null $custom
     * @return array<string, mixed>|null
     */
    private function customData(?array $custom): ?array
    {
        if (empty($custom)) {
            return null;
        }

        $kept = array_intersect_key($custom, array_flip(self::CUSTOM_DATA_KEYS));

        // `contents` rows get the same treatment one level down.
        if (isset($kept['contents']) && is_array($kept['contents'])) {
            $kept['contents'] = array_values(array_map(
                fn ($row): array => is_array($row)
                    ? array_intersect_key($row, array_flip(['id', 'quantity', 'item_price']))
                    : [],
                array_slice($kept['contents'], 0, 50),
            ));
        }

        return $kept ?: null;
    }
}
