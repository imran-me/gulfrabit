<?php

declare(strict_types=1);

namespace Modules\Marketing\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
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

    /** The only custom_data keys forwarded. Everything else is dropped unread. */
    private const CUSTOM_DATA_KEYS = [
        'value', 'currency', 'content_ids', 'content_name', 'content_type',
        'contents', 'num_items',
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $pixelId = config('services.meta.pixel_id');
        $token   = config('services.meta.capi_token');

        // Not configured is a legitimate, permanent state — the shop before
        // its first ad campaign. 204 tells analytics.js's circuit breaker to
        // keep sending (the route exists), while nothing is forwarded. It
        // becomes live by setting two .env keys, with no deploy.
        if (! $pixelId || ! $token) {
            return response()->json(null, 204);
        }

        $data = $request->validate([
            'event_name' => ['required', Rule::in([
                'PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase',
            ])],
            'event_id'         => ['required', 'string', 'max:64'],
            'event_time'       => ['sometimes', 'nullable', 'integer'],
            'event_source_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'custom_data'      => ['sometimes', 'nullable', 'array'],
            'attribution'      => ['sometimes', 'nullable', 'array', 'max:10'],
            'attribution.*'    => ['string', 'max:255'],
        ]);

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

        // Synchronous with a short timeout rather than queued: this shared
        // host runs no queue worker, and the caller is a keepalive beacon the
        // customer never waits on — four slow seconds here cost nobody
        // anything visible. Failures are logged and swallowed; tracking must
        // never be the reason a shop misbehaves.
        try {
            $response = Http::timeout(4)
                ->post(
                    sprintf('https://graph.facebook.com/%s/%s/events', self::GRAPH_VERSION, $pixelId),
                    $payload + ['access_token' => $token],
                );

            if ($response->failed()) {
                Log::warning('capi: Meta refused the event', [
                    'event'  => $data['event_name'],
                    'status' => $response->status(),
                    'body'   => mb_substr($response->body(), 0, 500),
                ]);
            }
        } catch (Throwable $e) {
            Log::warning('capi: Meta unreachable', ['error' => $e->getMessage()]);
        }

        return response()->json(['ok' => true], 202);
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
