<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Modules\Marketing\Services\TrafficClassifier;

/**
 * Give the events recorded before 12 September the context the new columns hold.
 *
 * The pixel went live on 6 September and every event since has been kept, so
 * the Tracking screen's new reports would otherwise open with a week of rows
 * filed under "unknown" - exactly the week of the first ad campaign, which is
 * the week the merchant most wants to read.
 *
 * WHAT CAN BE RECOVERED, AND WHAT CANNOT
 * --------------------------------------
 * Recoverable from what was stored: the channel (from the landing URL's utm
 * tags and the referrer), the landing page, new-versus-returning, the
 * external referrer, and the product each single-product event was about.
 *
 * NOT recoverable: device, OS and browser. The user agent was never stored -
 * on purpose - so those stay empty on old rows and the screen shows them as
 * "Unknown". For the same reason an old visit that arrived through Facebook's
 * in-app browser with no referrer reads as Direct here, where a new one is
 * recognised by its agent. Search terms were not stored either.
 *
 * Walked in id order, so each session's first event and each visitor's first
 * session are met before anything that follows them - the same rule
 * VisitContext applies live.
 *
 * NEVER FAILS THE DEPLOY. A row that cannot be updated is skipped and
 * counted; a backfill of history is not worth a site stuck half-deployed.
 */
return new class extends Migration
{
    private const PRODUCT_EVENTS = ['ViewContent', 'AddToCart', 'AddToWishlist'];

    public function up(): void
    {
        if (! Schema::hasColumn('tracking_events', 'channel')) {
            return;
        }

        $classify = new TrafficClassifier();
        $own      = (string) (parse_url((string) config('app.url'), PHP_URL_HOST) ?: 'gulfrabit.com');

        /** @var array<string, array<string, string|null>> $sessions */
        $sessions = [];
        /** @var array<string, bool> $visitors */
        $visitors = [];
        $skipped  = 0;

        DB::table('tracking_events')
            ->whereNull('channel')
            ->select(['id', 'session_id', 'visitor_id', 'event_name', 'path', 'source_url', 'referrer', 'content_ids'])
            ->chunkById(500, function ($rows) use ($classify, $own, &$sessions, &$visitors, &$skipped): void {
                foreach ($rows as $row) {
                    try {
                        $sid = $row->session_id;

                        if ($sid !== null && isset($sessions[$sid])) {
                            $visit = $sessions[$sid];
                        } else {
                            $vid       = $row->visitor_id;
                            $returning = $vid !== null && isset($visitors[$vid]);

                            if ($vid !== null) {
                                $visitors[$vid] = true;
                            }

                            $visit = [
                                'channel'      => $classify->channel($row->source_url, $row->referrer, '', $own),
                                'landing_path' => $row->path !== null ? mb_substr((string) $row->path, 0, 512) : null,
                                'visit_type'   => $vid === null ? null : ($returning ? 'returning' : 'new'),
                            ];

                            if ($sid !== null) {
                                $sessions[$sid] = $visit;
                            }
                        }

                        $refHost = $classify->host($row->referrer);

                        DB::table('tracking_events')->where('id', $row->id)->update($visit + [
                            'referrer_host' => $refHost !== null && ! $classify->sameSite($refHost, $own)
                                ? mb_substr($refHost, 0, 128)
                                : null,
                            'product_id' => $this->productId($row->event_name, $row->content_ids),
                        ]);
                    } catch (Throwable) {
                        $skipped++;
                    }
                }
            });

        if ($skipped > 0) {
            Log::warning('tracking backfill: some rows kept their blank context', ['rows' => $skipped]);
        }
    }

    public function down(): void
    {
        // Nothing to undo: the previous migration's down() drops the columns.
    }

    private function productId(?string $event, mixed $contentIds): ?string
    {
        if (! in_array($event, self::PRODUCT_EVENTS, true) || ! is_string($contentIds)) {
            return null;
        }

        $ids = json_decode($contentIds, true);
        if (! is_array($ids) || $ids === []) {
            return null;
        }

        $first = reset($ids);

        return is_scalar($first) && (string) $first !== '' ? mb_substr((string) $first, 0, 64) : null;
    }
};
