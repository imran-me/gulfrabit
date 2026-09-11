<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use Illuminate\Http\Request;
use Modules\Marketing\Models\TrackingEvent;
use Throwable;

/**
 * The context an event is recorded with: the visit it belongs to, the device
 * it came from, and what it was about.
 *
 * A VISIT HAS ONE CHANNEL, ONE LANDING PAGE, ONE "NEW OR RETURNING".
 * All three are decided by the visit's FIRST event and copied onto every event
 * after it. The alternative - deciding per event - files the second page of
 * every Facebook visit under "Direct", because its referrer is this shop's own
 * home page. Copying costs one indexed lookup per event and turns every report
 * on the Tracking screen into a plain `where channel = ?` instead of a
 * first-event subquery repeated in a dozen places.
 *
 * NEVER THROWS.
 * It runs inside the tracking beacon, on every page of every visitor. A failed
 * lookup costs the three session-level fields for that one event; the event
 * itself is still recorded, and the device fields - which need no database -
 * still arrive.
 */
final class VisitContext
{
    /** The events that are about ONE product, whose id is worth a column. */
    private const PRODUCT_EVENTS = ['ViewContent', 'AddToCart', 'AddToWishlist'];

    public function __construct(private readonly TrafficClassifier $classify)
    {
    }

    /**
     * @param  array<string, mixed> $data  the validated beacon
     * @return array<string, mixed>        columns for tracking_events
     */
    public function resolve(Request $request, array $data): array
    {
        $agent  = (string) $request->userAgent();
        $custom = is_array($data['custom_data'] ?? null) ? $data['custom_data'] : [];
        $event  = (string) ($data['event_name'] ?? '');

        // getHost() throws on a malformed Host header rather than returning
        // one; "not this shop" is the safe reading of a host we cannot parse.
        try {
            $own = (string) $request->getHost();
        } catch (Throwable) {
            $own = '';
        }

        $refHost = $this->classify->host(isset($data['referrer']) ? (string) $data['referrer'] : null);

        $context = [
            'device'  => $this->classify->device($agent),
            'os'      => $this->classify->os($agent),
            'browser' => $this->classify->browser($agent),
            // Only a referrer from OUTSIDE the shop is worth keeping: the
            // shop's own pages refer to each other on every click.
            'referrer_host' => $refHost !== null && ! $this->classify->sameSite($refHost, $own)
                ? mb_substr($refHost, 0, 128)
                : null,
            'product_id'     => $this->productId($event, $custom),
            'search_term'    => null,
            'search_results' => null,
            'channel'        => null,
            'landing_path'   => null,
            'visit_type'     => null,
        ];

        if ($event === 'Search') {
            $context['search_term']    = $this->searchTerm($custom['search_string'] ?? null);
            // Search sends up to ten result ids, so zero means "found nothing" -
            // the most valuable row in that report: demand the shop is not
            // meeting, typed out by the customer in their own words.
            $context['search_results'] = is_array($custom['content_ids'] ?? null)
                ? min(count($custom['content_ids']), 255)
                : 0;
        }

        try {
            $context = array_merge($context, $this->visit($data, $agent, $own));
        } catch (Throwable) {
            // See the class comment: the event records without these three.
        }

        return $context;
    }

    /**
     * Channel, landing page and visit type - inherited from the visit's first
     * event when there is one, worked out from this event when it IS the first.
     *
     * @param  array<string, mixed> $data
     * @return array<string, string|null>
     */
    private function visit(array $data, string $agent, string $own): array
    {
        $session = isset($data['session_id']) ? (string) $data['session_id'] : null;
        $visitor = isset($data['visitor_id']) ? (string) $data['visitor_id'] : null;

        if ($session !== null && $session !== '') {
            $first = TrackingEvent::query()
                ->where('session_id', $session)
                ->orderBy('created_at')
                ->orderBy('id')
                ->first(['channel', 'landing_path', 'visit_type']);

            // A row from before these columns existed has no channel; the
            // backfill migration fills those, and until it has run the visit
            // is worked out afresh rather than inheriting a blank.
            if ($first !== null && $first->channel !== null) {
                return [
                    'channel'      => $first->channel,
                    'landing_path' => $first->landing_path,
                    'visit_type'   => $first->visit_type,
                ];
            }
        }

        $returning = false;
        if ($visitor !== null && $visitor !== '') {
            $returning = TrackingEvent::query()
                ->where('visitor_id', $visitor)
                ->when($session, fn ($q) => $q->where('session_id', '!=', $session))
                ->exists();
        }

        return [
            'channel' => $this->classify->channel(
                isset($data['event_source_url']) ? (string) $data['event_source_url'] : null,
                isset($data['referrer']) ? (string) $data['referrer'] : null,
                $agent,
                $own,
            ),
            'landing_path' => isset($data['path']) ? mb_substr((string) $data['path'], 0, 512) : null,
            'visit_type'   => $visitor ? ($returning ? 'returning' : 'new') : null,
        ];
    }

    /** @param array<string, mixed> $custom */
    private function productId(string $event, array $custom): ?string
    {
        if (! in_array($event, self::PRODUCT_EVENTS, true)) {
            return null;
        }

        $ids = $custom['content_ids'] ?? null;
        if (! is_array($ids) || $ids === []) {
            return null;
        }

        $first = reset($ids);

        return is_scalar($first) && (string) $first !== '' ? mb_substr((string) $first, 0, 64) : null;
    }

    /**
     * What was typed, folded so "Ajwa", "ajwa " and "AJWA" are one row.
     * Lower-casing is a no-op for Bengali, which is the right answer: there is
     * no case to fold.
     */
    private function searchTerm(mixed $raw): ?string
    {
        if (! is_string($raw)) {
            return null;
        }

        $term = trim((string) preg_replace('/\s+/u', ' ', $raw));

        return $term === '' ? null : mb_substr(mb_strtolower($term), 0, 128);
    }
}
