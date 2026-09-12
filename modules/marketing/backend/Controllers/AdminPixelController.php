<?php

declare(strict_types=1);

namespace Modules\Marketing\Controllers;

use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Modules\Marketing\Services\MetaPixelSettings;
use Modules\Marketing\Services\PixelStamp;
use RuntimeException;
use Throwable;

/**
 * Admin → Pixel setup: the three Meta keys, typed in by the owner.
 *
 * Before this screen the keys lived in .env and site-config.js, which meant a
 * developer and a deploy for what is, to a shop owner, "paste the numbers Meta
 * gave me". Now a save does three things at once: stores the keys encrypted
 * (MetaPixelSettings), rewrites the pixel block in every storefront page
 * (PixelStamp), and — because TrackController asks the same service — changes
 * what the server forwards on the very next event.
 *
 * THE TOKEN NEVER COMES BACK
 * --------------------------
 * No response carries the access token, only a preview and its length. The
 * browser that pasted it is the last place it exists in full; nothing here
 * logs it, echoes it in an error, or returns it to be "shown again".
 *
 * Every message is written for the owner, not a developer. Most of them name
 * the exact screen in Events Manager where the right value is found, because
 * the commonest mistake by far is a right value pasted into the wrong box.
 */
class AdminPixelController extends Controller
{
    private const PIXEL_ID_HINT = 'The Pixel ID is a number, 15 or 16 digits long — the one under your '
        . 'pixel\'s name in Events Manager.';

    private const TOKEN_HINT = 'The access token is one long code with no spaces, usually starting with EAA. '
        . 'Copy it again from Events Manager → Settings → Conversions API → Generate access token.';

    private const TEST_CODE_HINT = 'The test event code is the short code shown in Events Manager → Test events, '
        . 'like TEST12345.';

    private const NOT_SAVED = 'The keys could not be saved because the database refused the change. If the site '
        . 'was deployed a moment ago, its database update may not have run yet — try again in a minute.';

    public function __construct(
        private readonly MetaPixelSettings $settings,
        private readonly PixelStamp $stamp,
    ) {
    }

    /** GET /api/admin/marketing/pixel */
    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->state()]);
    }

    /**
     * PUT /api/admin/marketing/pixel
     *
     * Normalised BEFORE it is validated: a pixel id pasted with a space in it,
     * or a test code copied with its `test_event_code:` label, is the right
     * value in the wrong shape, and refusing it would be the panel being
     * pedantic about something it can fix itself.
     */
    public function update(Request $request): JsonResponse
    {
        // Shape first. `present`, not `required`: an empty Pixel ID is a real
        // answer (switch the pixel off) and an empty test code switches test
        // mode off — but a request that FORGOT either field must not be read
        // as asking for that. A missing accessToken is harmless: it means keep.
        $request->validate([
            'pixelId' => ['present', 'nullable', 'string', 'max:500'],
            'accessToken' => ['sometimes', 'nullable', 'string', 'max:4096'],
            'removeAccessToken' => ['sometimes', 'boolean'],
            'testEventCode' => ['present', 'nullable', 'string', 'max:500'],
        ], [
            'pixelId.present' => 'Send the Pixel ID, or an empty one to switch the pixel off.',
            'pixelId.string' => 'Send the Pixel ID as text: a 16-digit number is too long to survive being sent as a number.',
            'pixelId.max' => self::PIXEL_ID_HINT,
            'accessToken.string' => self::TOKEN_HINT,
            'accessToken.max' => self::TOKEN_HINT,
            'removeAccessToken.boolean' => 'Say whether to remove the saved access token: true or false.',
            'testEventCode.present' => 'Send the test event code, or an empty one to switch test mode off.',
            'testEventCode.string' => self::TEST_CODE_HINT,
            'testEventCode.max' => self::TEST_CODE_HINT,
        ]);

        $pixelId = MetaPixelSettings::normalisePixelId($request->input('pixelId'));
        $token = MetaPixelSettings::normaliseToken($request->input('accessToken'));
        $remove = $request->boolean('removeAccessToken');
        $code = MetaPixelSettings::normaliseTestCode($request->input('testEventCode'));

        $errors = array_filter([
            'pixelId' => $this->pixelIdError($pixelId),
            'accessToken' => $this->tokenError($token, $remove),
            'testEventCode' => $this->testCodeError($code),
        ]);

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        try {
            // '' = keep whatever token is in force; see MetaPixelSettings::save().
            $this->settings->save($pixelId, $token === '' ? null : $token, $remove, $code, $this->by($request));
        } catch (QueryException $e) {
            // errorInfo, not the message: the message carries the SQL and its
            // bindings, and one of those is the encrypted value.
            Log::error('pixel: the Meta keys could not be saved', [
                'sqlstate' => $e->errorInfo[0] ?? null,
                'error' => $e->errorInfo[2] ?? null,
            ]);

            return response()->json(['message' => self::NOT_SAVED], 500);
        }

        // An error Meta gave for the OLD keys says nothing about these.
        $this->settings->clearFailure();

        $stamp = $this->applyStamp();

        return response()->json(['data' => $this->state(), 'meta' => ['stamp' => $stamp]]);
    }

    /**
     * POST /api/admin/marketing/pixel/test
     *
     * One PageView, sent the way the forwarder sends, with the SAVED keys — so
     * a pass here means the real events will pass too. It always carries the
     * test code, and refuses to run without one: without it Meta would count
     * the test as a real visit in the shop's ad reports.
     */
    public function test(Request $request): JsonResponse
    {
        $c = $this->settings->current();

        $missing = array_keys(array_filter([
            'the Pixel ID' => $c['pixelId'] === null,
            'the access token' => $c['accessToken'] === null,
            'a test event code' => $c['testEventCode'] === null,
        ]));

        if ($missing !== []) {
            $message = 'To send a test event, first save ' . $this->listing($missing) . '.';

            if ($c['testEventCode'] === null) {
                $message .= ' The test event code is what keeps a test out of your real numbers — without one, '
                    . 'Meta would count the test as a real visit. Copy it from Events Manager → Test events.';
            }

            return response()->json(['message' => $message], 422);
        }

        $payload = [
            'data' => [[
                'event_name' => 'PageView',
                'event_time' => time(),
                'event_id' => 'gr-panel-test-' . bin2hex(random_bytes(6)),
                'event_source_url' => url('/'),
                'action_source' => 'website',
                'user_data' => array_filter([
                    'client_ip_address' => $request->ip(),
                    'client_user_agent' => (string) $request->userAgent(),
                ]),
            ]],
            'test_event_code' => $c['testEventCode'],
            'access_token' => $c['accessToken'],
        ];

        try {
            $response = Http::timeout(8)->post(
                sprintf(
                    'https://graph.facebook.com/%s/%s/events',
                    TrackController::GRAPH_VERSION,
                    rawurlencode((string) $c['pixelId']),
                ),
                $payload,
            );
        } catch (Throwable $e) {
            // The exception names the URL, which carries the pixel id and not
            // the token — the token travels in the body.
            Log::warning('pixel: the test event could not reach Meta', ['error' => $e->getMessage()]);

            return response()->json(['message' => $this->settings->explain(null, null, 0)], 502);
        }

        if ($response->failed()) {
            $error = $response->json('error');
            $error = is_array($error) ? $error : [];
            $code = isset($error['code']) && is_numeric($error['code']) ? (int) $error['code'] : null;

            // Both of Meta's texts: `message` is what explain() recognises,
            // `error_user_msg` is the friendlier one when Meta bothers to send it.
            $said = implode(' — ', array_filter([
                is_string($error['message'] ?? null) ? $error['message'] : null,
                is_string($error['error_user_msg'] ?? null) ? $error['error_user_msg'] : null,
            ]));

            Log::info('pixel: Meta refused the panel test event', [
                'status' => $response->status(),
                'code' => $code,
                'fbtrace_id' => $error['fbtrace_id'] ?? null,
            ]);

            return response()->json([
                'message' => $this->settings->explain($code, $said === '' ? null : $said, $response->status()),
                'code' => $code,
            ], $response->serverError() ? 502 : 422);
        }

        $trace = $response->json('fbtrace_id');

        return response()->json(['data' => [
            'eventsReceived' => (int) $response->json('events_received', 0),
            'fbtraceId' => is_string($trace) ? $trace : null,
            'testEventCode' => $c['testEventCode'],
            'eventName' => 'PageView',
            'sentAt' => now()->toIso8601String(),
        ]]);
    }

    /** POST /api/admin/marketing/pixel/test-mode  {on: bool} */
    public function testMode(Request $request): JsonResponse
    {
        $request->validate(
            ['on' => ['required', 'boolean']],
            [
                'on.required' => 'Say whether test mode should be on or off.',
                'on.boolean' => 'Say whether test mode should be on or off: true or false.',
            ],
        );

        try {
            $this->settings->setTestMode($request->boolean('on'), $this->by($request));
        } catch (QueryException $e) {
            // Caught BEFORE RuntimeException, which it extends: a database
            // error must not reach the owner as if it were one of the service's
            // plain-English refusals, SQL and all.
            Log::error('pixel: test mode could not be saved', [
                'sqlstate' => $e->errorInfo[0] ?? null,
                'error' => $e->errorInfo[2] ?? null,
            ]);

            return response()->json(['message' => self::NOT_SAVED], 500);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $this->state()]);
    }

    /**
     * POST /api/admin/marketing/pixel/stamp
     *
     * Write the saved pixel into every page again, without changing any key.
     * For when the pages disagree with the panel: a restore from a backup, a
     * file edited by hand, a deploy whose own stamp failed.
     */
    public function stamp(): JsonResponse
    {
        $c = $this->settings->current();

        if ($c['source'] !== 'panel') {
            return response()->json([
                'message' => $c['problem'] ?? 'Nothing is saved in this panel yet — save the keys first.',
            ], 422);
        }

        $stamp = $this->applyStamp();

        return response()->json(['data' => $this->state(), 'meta' => ['stamp' => $stamp]]);
    }

    /**
     * Everything the screen shows, in one shape for every endpoint.
     *
     * @return array<string, mixed>
     */
    private function state(): array
    {
        $c = $this->settings->current();
        $active = $this->settings->testModeActive();

        try {
            $survey = $this->stamp->survey();
        } catch (Throwable) {
            $survey = ['total' => 0, 'ids' => [], 'unknown' => 0];
        }

        // (string): PHP stores a numeric-string key as an int, so the survey's
        // "1423900436303846" comes back as 1423900436303846.
        $target = $c['pixelId'] ?? '';
        $matching = 0;

        foreach ($survey['ids'] as $id => $count) {
            if ((string) $id === $target) {
                $matching += $count;
            }
        }

        return [
            'source' => $c['source'],
            'pixelId' => $c['pixelId'],
            'accessToken' => [
                'set' => $c['accessToken'] !== null,
                'preview' => MetaPixelSettings::preview($c['accessToken']),
                'length' => $c['accessToken'] !== null ? strlen($c['accessToken']) : null,
            ],
            'testEventCode' => $c['testEventCode'],
            'testMode' => [
                'active' => $active,
                // Only while it is running: an `until` in the past next to
                // `active: false` invites a screen to say "on until 10:30".
                'until' => $active && $c['testUntil'] !== null ? $c['testUntil']->toIso8601String() : null,
                'minutes' => MetaPixelSettings::TEST_WINDOW_MINUTES,
                'alwaysOn' => $c['source'] === 'env' && $c['testEventCode'] !== null,
            ],
            'updatedBy' => $c['updatedBy'],
            'updatedAt' => $c['updatedAt']?->toIso8601String(),
            'problem' => $c['problem'],
            'pages' => [
                'total' => $survey['total'],
                'matching' => $matching,
                // An object even when empty or when every key is numeric: as a
                // PHP array it would serialise as [] — or, for a lone "0", as a
                // list.
                'ids' => (object) $survey['ids'],
            ],
            'forwarding' => $this->settings->forwarding(),
        ];
    }

    /**
     * Write the pixel in force into every page.
     *
     * Never throws: the keys are already saved by the time this runs, and a
     * page that cannot be written is something to show the owner, not a
     * reason to answer the save with an error it did not have.
     *
     * @return array{pages: int, changed: int, failed: object}
     */
    private function applyStamp(): array
    {
        $pixelId = $this->settings->current()['pixelId'] ?? '';

        try {
            $result = $this->stamp->apply($pixelId);
        } catch (Throwable $e) {
            // Only reachable when the block itself cannot be made — the
            // template is missing — and PixelStamp promises no page was touched.
            Log::error('pixel: no page could be updated', ['error' => $e->getMessage()]);

            try {
                $pages = count($this->stamp->pages());
            } catch (Throwable) {
                $pages = 0;
            }

            return ['pages' => $pages, 'changed' => 0, 'failed' => (object) [PixelStamp::TEMPLATE => $e->getMessage()]];
        }

        if ($result['failed'] !== []) {
            Log::warning('pixel: some pages could not be updated', ['failed' => $result['failed']]);
        }

        return [
            'pages' => $result['pages'],
            'changed' => $result['changed'],
            'failed' => (object) $result['failed'],
        ];
    }

    private function pixelIdError(string $pixelId): ?string
    {
        if ($pixelId === '' || preg_match('/^[0-9]{10,20}$/D', $pixelId) === 1) {
            return null;
        }

        if (str_starts_with($pixelId, 'EAA') || (strlen($pixelId) > 40 && preg_match('/[A-Za-z]/', $pixelId) === 1)) {
            return 'That looks like the access token, not the Pixel ID. ' . self::PIXEL_ID_HINT
                . ' The token goes in its own box.';
        }

        if (preg_match('/^TEST[A-Z0-9]*$/i', $pixelId) === 1) {
            return 'That looks like the test event code, not the Pixel ID. ' . self::PIXEL_ID_HINT;
        }

        return self::PIXEL_ID_HINT;
    }

    private function tokenError(string $token, bool $remove): ?string
    {
        if ($token === '') {
            return null;   // keep the saved one
        }

        if ($remove) {
            return 'Either paste a new access token or remove the saved one — not both at once.';
        }

        if (preg_match('/^[0-9]+$/D', $token) === 1) {
            return 'That looks like a Pixel ID, not an access token. ' . self::TOKEN_HINT;
        }

        if (strlen($token) < 30 && preg_match('/^TEST[A-Z0-9]*$/i', $token) === 1) {
            return 'That looks like the test event code, not an access token. ' . self::TOKEN_HINT;
        }

        if (preg_match('/^[A-Za-z0-9_\-|.]{30,1024}$/D', $token) !== 1) {
            return self::TOKEN_HINT;
        }

        return null;
    }

    private function testCodeError(string $code): ?string
    {
        if ($code === '' || preg_match('/^[A-Z0-9]{4,32}$/D', $code) === 1) {
            return null;
        }

        if (str_starts_with($code, 'EAA') && strlen($code) > 32) {
            return 'That looks like the access token, not the test event code. ' . self::TEST_CODE_HINT;
        }

        return self::TEST_CODE_HINT;
    }

    /** "a, b and c" — the list reads as a sentence, not as field names. */
    private function listing(array $items): string
    {
        $last = array_pop($items);

        return $items === [] ? (string) $last : implode(', ', $items) . ' and ' . $last;
    }

    private function by(Request $request): string
    {
        return (string) ($request->user('admin')?->name ?? 'admin');
    }
}
