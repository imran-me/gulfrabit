<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Schema;
use Modules\Marketing\Models\MarketingSetting;
use Modules\Marketing\Models\TrackingEvent;
use RuntimeException;
use Throwable;

/**
 * Which Meta keys are in force — the ONE place that answers it.
 *
 * Three keys: the Pixel ID (public, it is in every page), the Conversions API
 * access token (secret) and the test event code (sends events to Events
 * Manager's Test events tab instead of counting them). They can come from
 * Admin → Pixel setup or, as they always did, from .env.
 *
 * THE PRECEDENCE RULE, AND WHY IT IS ALL-OR-NOTHING
 * -------------------------------------------------
 * Once a row has been saved in the panel it wins for ALL THREE keys, blanks
 * included — a blank there means "off", not "look in .env". Never mixed field
 * by field, because the mix is exactly the bug worth preventing: a pixel id
 * from the panel with a token left in .env for the pixel the shop used to have
 * is a pair Meta rejects on every event, and nothing on either screen would
 * show why. No row at all means .env, exactly as before this screen existed.
 *
 * THE TEST CODE SWITCHES ITSELF OFF
 * ---------------------------------
 * While a test code is attached, Meta shows events in Test events and does NOT
 * count them for the ads — so a code left on by accident quietly costs the
 * campaign its conversions. A code saved in the panel is therefore only sent
 * for TEST_WINDOW_MINUTES after it was saved or switched on. A code in .env
 * keeps its old always-on behaviour; the panel flags it instead.
 *
 * NEVER THE REASON SOMETHING BREAKS
 * ---------------------------------
 * TrackController asks this on every tracked event. A table that does not exist
 * yet (deployed, not migrated), a database that is down, a row that no longer
 * decrypts because APP_KEY changed — each reads as "no row" and falls back to
 * .env, and the last two leave a plain-English `problem` for the panel to show.
 */
class MetaPixelSettings
{
    public const KEY = 'meta_pixel';

    public const TEST_WINDOW_MINUTES = 60;

    private const FAILURE_KEY = 'marketing:meta:last-failure';

    /**
     * Whitespace and the invisible characters a copy from a web page brings
     * along — non-breaking and zero-width spaces, a byte-order mark. A pasted
     * id carrying one looks right on screen and fails every check.
     */
    private const INVISIBLE = '/[\s\x{00A0}\x{1680}\x{2000}-\x{200D}\x{2028}\x{2029}\x{202F}\x{205F}\x{2060}\x{3000}\x{FEFF}]+/u';

    private const UNREADABLE_ROW = 'The Meta keys saved on this screen can no longer be read: the website\'s '
        . 'encryption key (APP_KEY) has changed since they were saved. Please enter all three keys again '
        . 'and save. Until then the site is using the keys in the server\'s .env file, if it has any.';

    private const DATABASE_DOWN = 'The database could not be read just now, so any keys saved on this screen '
        . 'are not in force at the moment. The site is using the keys in the server\'s .env file, if it has any.';

    /**
     * Memoised for the life of this instance and reset on every write.
     *
     * @var array<string, mixed>|null
     */
    private ?array $current = null;

    /**
     * Everything the panel needs to describe the keys in force.
     *
     * @return array{
     *     source: 'panel'|'env'|'none',
     *     pixelId: ?string,
     *     accessToken: ?string,
     *     testEventCode: ?string,
     *     testUntil: ?CarbonImmutable,
     *     updatedBy: ?string,
     *     updatedAt: ?\Illuminate\Support\Carbon,
     *     problem: ?string,
     * }
     */
    public function current(): array
    {
        return $this->current ??= $this->resolve();
    }

    /**
     * What the forwarder sends with. The test code only while it is in force.
     *
     * @return array{pixelId: ?string, accessToken: ?string, testEventCode: ?string}
     */
    public function forTracking(): array
    {
        $c = $this->current();

        return [
            'pixelId' => $c['pixelId'],
            'accessToken' => $c['accessToken'],
            'testEventCode' => $this->testCodeInForce($c),
        ];
    }

    /** Whether events are going to Test events right now. */
    public function testModeActive(): bool
    {
        return $this->testCodeInForce($this->current()) !== null;
    }

    /**
     * Save the three keys from the panel. From now on the panel is the
     * authority for all of them — see the precedence rule above.
     *
     * $accessToken null (or blank) KEEPS the token in force, whatever its
     * source. The form never holds the real token, so a blank box has to mean
     * "unchanged"; and a first save on a shop that was set up through .env must
     * not silently drop the token it was already forwarding with.
     * $removeToken wins over a supplied token.
     *
     * @return array<string, mixed> The new current().
     */
    public function save(string $pixelId, ?string $accessToken, bool $removeToken, string $testEventCode, string $by): array
    {
        $before = $this->current();

        $pixelId = self::normalisePixelId($pixelId);
        $code = self::normaliseTestCode($testEventCode);
        $token = self::normaliseToken($accessToken);

        $token = match (true) {
            $removeToken => null,
            $token !== '' => $token,
            default => $before['accessToken'],
        };

        // A new code, a changed code, or the first save into the panel starts
        // the hour. Saving the SAME code again keeps its clock — including a
        // clock that has already run out — so editing the pixel id does not
        // quietly put the shop's traffic back into test mode.
        $testUntil = match (true) {
            $code === '' => null,
            $before['source'] !== 'panel',
            $code !== $before['testEventCode'] => CarbonImmutable::now()->addMinutes(self::TEST_WINDOW_MINUTES),
            default => $before['testUntil'],
        };

        $this->write([
            'pixelId' => $pixelId === '' ? null : $pixelId,
            'accessToken' => $token,
            'testEventCode' => $code === '' ? null : $code,
            'testUntil' => $testUntil?->toIso8601String(),
        ], $by);

        return $this->current();
    }

    /**
     * Start another hour of test mode for the saved code, or stop it now.
     *
     * @throws RuntimeException with a sentence the panel shows as it is.
     * @return array<string, mixed> The new current().
     */
    public function setTestMode(bool $on, string $by): array
    {
        $c = $this->current();

        if ($c['source'] !== 'panel') {
            throw new RuntimeException($c['problem'] ?? (
                $c['source'] === 'env' && $c['testEventCode'] !== null
                    ? 'The test event code is coming from the server\'s .env file, so it is on all the time and '
                        . 'cannot be switched from here. Save the keys on this screen to control test mode here.'
                    : 'Nothing is saved on this screen yet — save the keys first.'
            ));
        }

        if ($on && $c['testEventCode'] === null) {
            throw new RuntimeException('There is no test event code saved. Copy it from Events Manager → '
                . 'Test events, paste it into the box and save — saving it starts test mode too.');
        }

        $this->write([
            'pixelId' => $c['pixelId'],
            'accessToken' => $c['accessToken'],
            'testEventCode' => $c['testEventCode'],
            'testUntil' => $on
                ? CarbonImmutable::now()->addMinutes(self::TEST_WINDOW_MINUTES)->toIso8601String()
                : null,
        ], $by);

        return $this->current();
    }

    /** A Pixel ID with every space removed — people paste "1423 9004 3630 3846". */
    public static function normalisePixelId(?string $value): string
    {
        return self::squeeze($value);
    }

    /** A token with every space and line break removed — long strings wrap when copied. */
    public static function normaliseToken(?string $value): string
    {
        return self::squeeze($value);
    }

    /**
     * A test code, spaces removed and upper-cased, with the label stripped:
     * Events Manager shows it as `test_event_code: TEST12345` (and as
     * `"test_event_code": "TEST12345"` in its code sample), and people copy
     * the whole line.
     */
    public static function normaliseTestCode(?string $value): string
    {
        $code = self::squeeze($value);
        $code = preg_replace('/^[\x22\x27]?test_event_code[\x22\x27]?[:=]/i', '', $code) ?? $code;

        return strtoupper(trim($code, "\"',;"));
    }

    /**
     * Enough of a token to recognise it, never enough to use it.
     * A short one (only possible from .env) shows less, so a preview can never
     * be most of the secret.
     */
    public static function preview(?string $token): ?string
    {
        if ($token === null || $token === '') {
            return null;
        }

        return strlen($token) >= 20
            ? substr($token, 0, 6) . '…' . substr($token, -4)
            : substr($token, 0, 3) . '…';
    }

    /**
     * Remember the last time Meta refused the forwarder, already explained, for
     * the panel's health line. In the cache rather than the database: it is a
     * note, not a record, and it must be impossible for writing it to fail the
     * event it describes.
     */
    public function noteFailure(int $httpStatus, ?int $metaCode, ?string $metaMessage): void
    {
        try {
            cache()->put(self::FAILURE_KEY, [
                'message' => $this->explain($metaCode, $metaMessage, $httpStatus),
                'at' => now()->toIso8601String(),
            ], now()->addDays(7));
        } catch (Throwable) {
            // A note about a failure must never become a second failure.
        }
    }

    /** @return array{message: string, at: string}|null */
    public function lastFailure(): ?array
    {
        try {
            $note = cache()->get(self::FAILURE_KEY);
        } catch (Throwable) {
            return null;
        }

        return is_array($note) && isset($note['message'], $note['at'])
            ? ['message' => (string) $note['message'], 'at' => (string) $note['at']]
            : null;
    }

    /** Called on save: an error about the old keys says nothing about the new ones. */
    public function clearFailure(): void
    {
        try {
            cache()->forget(self::FAILURE_KEY);
        } catch (Throwable) {
            // Nothing to do; the note expires on its own.
        }
    }

    /**
     * Meta's error, in words a shop owner can act on.
     *
     * Meta's own messages are written for developers — "(#100) Object with ID
     * '…' does not exist, cannot be loaded due to missing permissions" — and
     * the three failures a shop actually meets each have one fix, so those are
     * named outright. Anything else is passed on, trimmed, rather than
     * guessed at.
     */
    public function explain(?int $metaCode, ?string $metaMessage, int $httpStatus = 0): string
    {
        // Belt and braces: Meta does not echo the token back, but a message that
        // somehow carried one must not be stored and shown in the panel.
        $said = trim(preg_replace('/EAA[A-Za-z0-9_\-|.]{10,}/', '[token]', (string) $metaMessage) ?? '');

        if ($metaCode === 190) {
            return 'Meta did not accept the access token: it is wrong, has expired, or was revoked. '
                . 'Generate a new one in Events Manager → Settings → Conversions API, paste it here and save.';
        }

        if ($metaCode === 100 && preg_match('/does not exist|unsupported post request|missing permission/i', $said) === 1) {
            return 'Meta cannot use that Pixel ID with this access token. Check the Pixel ID — the number under '
                . 'your pixel\'s name in Events Manager — and generate the token from that same pixel\'s Settings '
                . 'page, so the two belong together.';
        }

        if (in_array($metaCode, [10, 200, 294], true)) {
            return 'This access token is not allowed to send events for this pixel. Generate a new one from the '
                . 'pixel\'s own Settings page in Events Manager → Conversions API, paste it here and save.';
        }

        if ($said !== '') {
            return 'Meta said: ' . (mb_strlen($said) > 200 ? rtrim(mb_substr($said, 0, 200)) . '…' : $said);
        }

        if ($httpStatus === 0) {
            return 'The server could not reach Meta — the connection failed or timed out. This usually passes on '
                . 'its own; if it keeps happening, ask the hosting company whether the server may connect to '
                . 'graph.facebook.com.';
        }

        return "Meta refused the event (HTTP {$httpStatus}) without saying why. Try again in a few minutes.";
    }

    /**
     * Whether the server copy is reaching Meta, from the shop's own record of
     * every event. Never throws: a missing table reads as `available: false`.
     *
     * @return array{available: bool, hours: int, sent: int, failed: int, skipped: int,
     *               lastSentAt: ?string, lastFailure: ?array}
     */
    public function forwarding(int $hours = 24): array
    {
        $out = [
            'available' => false,
            'hours' => $hours,
            'sent' => 0,
            'failed' => 0,
            'skipped' => 0,
            'lastSentAt' => null,
            'lastFailure' => $this->lastFailure(),
        ];

        try {
            $counts = TrackingEvent::query()
                ->where('created_at', '>=', now()->subHours($hours))
                ->selectRaw('capi_status, COUNT(*) as n')
                ->groupBy('capi_status')
                ->pluck('n', 'capi_status');

            // Bounded to a month so it stays an index range, not a scan of
            // every event the shop ever recorded, when nothing has been sent.
            $last = TrackingEvent::query()
                ->where('capi_status', 'sent')
                ->where('created_at', '>=', now()->subDays(30))
                ->max('created_at');

            $out['sent'] = (int) ($counts['sent'] ?? 0);
            $out['failed'] = (int) ($counts['failed'] ?? 0);
            $out['skipped'] = (int) ($counts['skipped'] ?? 0);
            $out['lastSentAt'] = $last ? CarbonImmutable::parse((string) $last)->toIso8601String() : null;
            $out['available'] = true;
        } catch (Throwable) {
            // Not migrated yet, or the database is down: the zeros stand, and
            // `available` says they mean "unknown" rather than "nothing".
        }

        return $out;
    }

    /** @return array<string, mixed> */
    private function resolve(): array
    {
        [$row, $problem] = $this->row();

        if ($row !== null) {
            try {
                // Decrypted here, on first access — not when the row was loaded.
                $value = $row->value;

                if (! is_array($value)) {
                    throw new RuntimeException('The saved value is not a list of keys.');
                }

                return [
                    'source' => 'panel',
                    'pixelId' => self::clean($value['pixelId'] ?? null),
                    'accessToken' => self::clean($value['accessToken'] ?? null),
                    'testEventCode' => self::clean($value['testEventCode'] ?? null),
                    'testUntil' => self::date($value['testUntil'] ?? null),
                    'updatedBy' => $row->updated_by,
                    'updatedAt' => $row->updated_at,
                    'problem' => null,
                ];
            } catch (Throwable) {
                // Not logged: this runs on every tracked event, and one bad row
                // would write a line per visitor. The panel shows `problem`,
                // and `php artisan marketing:pixel-stamp` prints it on deploy.
                $problem = self::UNREADABLE_ROW;
            }
        }

        $pixelId = self::clean(config('services.meta.pixel_id'));
        $token = self::clean(config('services.meta.capi_token'));
        $code = self::clean(config('services.meta.test_event_code'));

        return [
            'source' => ($pixelId ?? $token ?? $code) !== null ? 'env' : 'none',
            'pixelId' => $pixelId,
            'accessToken' => $token,
            'testEventCode' => $code,
            'testUntil' => null,
            'updatedBy' => null,
            'updatedAt' => null,
            'problem' => $problem,
        ];
    }

    /**
     * The saved row, if any, and a problem to report when the database could
     * not even be asked.
     *
     * @return array{0: ?MarketingSetting, 1: ?string}
     */
    private function row(): array
    {
        try {
            return [MarketingSetting::query()->find(self::KEY), null];
        } catch (Throwable) {
            // Only on the failure path, so a healthy request pays nothing: a
            // table that does not exist yet is the ordinary state between a
            // deploy and its migration, and is not worth alarming anyone over.
            try {
                if (! Schema::hasTable((new MarketingSetting())->getTable())) {
                    return [null, null];
                }
            } catch (Throwable) {
                // The database itself is unreachable.
            }

            return [null, self::DATABASE_DOWN];
        }
    }

    /**
     * Write the row, encrypted, in one statement.
     *
     * The ciphertext comes from the model's own `encrypted:array` cast, so
     * there is one encryption path. It is then written with an upsert rather
     * than updateOrCreate on purpose: updateOrCreate loads the old row and
     * decrypts its value to see whether it changed, and after an APP_KEY change
     * that decrypt throws — which would make the one repair the panel asks the
     * owner for, saving the keys again, impossible.
     *
     * @param array<string, mixed> $value
     */
    private function write(array $value, string $by): void
    {
        $model = new MarketingSetting();
        $model->setAttribute('value', $value);
        $now = now();

        MarketingSetting::query()->toBase()->upsert(
            [[
                'key' => self::KEY,
                'value' => $model->getAttributes()['value'],
                'updated_by' => mb_substr($by, 0, 120),
                'created_at' => $now,
                'updated_at' => $now,
            ]],
            ['key'],
            ['value', 'updated_by', 'updated_at'],
        );

        $this->current = null;
    }

    /** @param array<string, mixed> $c */
    private function testCodeInForce(array $c): ?string
    {
        if ($c['testEventCode'] === null) {
            return null;
        }

        return match ($c['source']) {
            // .env never had a clock, and changing that silently would change
            // what a shop configured through .env sends.
            'env' => $c['testEventCode'],
            'panel' => $c['testUntil'] !== null && $c['testUntil']->isFuture() ? $c['testEventCode'] : null,
            default => null,
        };
    }

    private static function squeeze(?string $value): string
    {
        $value = (string) $value;

        // Null only on invalid UTF-8; fall back to plain ASCII whitespace.
        return preg_replace(self::INVISIBLE, '', $value) ?? preg_replace('/\s+/', '', $value) ?? $value;
    }

    private static function clean(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    private static function date(mixed $value): ?CarbonImmutable
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        try {
            return CarbonImmutable::parse($value);
        } catch (Throwable) {
            return null;
        }
    }
}
