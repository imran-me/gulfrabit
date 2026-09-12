<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Marketing\Controllers\TrackController;
use Modules\Marketing\Models\CampaignSpend;
use Throwable;

/**
 * What the ads cost, read from Meta and kept beside what they sold.
 *
 * One call per sync to the Marketing API's insights endpoint, at campaign
 * level with `time_increment=1`, which returns exactly the shape this shop
 * stores: one campaign, one day, one figure.
 *
 * A WINDOW, RE-READ, NOT AN APPEND
 * --------------------------------
 * Meta revises a day's spend for a day or two after it. So a sync re-reads
 * the last week and writes over what it finds, and the unique key on
 * (campaign, date) makes that safe to run as often as anyone likes.
 *
 * MANUAL ROWS SURVIVE A SYNC.
 * A row typed in the panel is there because Meta had nothing for it - a
 * boosted post, another ad account, an influencer paid in cash. A sync that
 * silently replaced it would delete the only record of that money.
 *
 * IT REFUSES RATHER THAN GUESS.
 * If the ad account bills in something other than taka and nobody has said
 * what a unit is worth, the sync stops and says so. Adding dollars to taka
 * because a number was missing is the one outcome worse than no report.
 */
final class MetaAdSpend
{
    /** The Conversions API forwarder's own version constant, so the two can never drift apart. */
    private const GRAPH = TrackController::GRAPH_VERSION;

    private const TIMEOUT = 20;

    /** Meta pages its insights; this many pages is far more than a shop has. */
    private const MAX_PAGES = 20;

    public function __construct(private readonly AdSpendSettings $settings)
    {
    }

    /**
     * Pull the last `$days` days of spend.
     *
     * @return array<string, mixed> { ok, rows, campaigns, spendTaka, currency, message }
     */
    public function sync(int $days = 7): array
    {
        $days = max(1, min(90, $days));
        $account = $this->settings->accountId();
        $token = $this->settings->token();

        if ($account === null) {
            return $this->fail($days, 'No ad account id is saved yet. It is the number beside your ad account in Ads Manager or Business Settings.');
        }
        if ($token === null) {
            return $this->fail($days, 'No access token to read the ad account with. Save one here, or save the Conversions API token in Pixel setup — the same token often carries both permissions.');
        }

        // What the account is, in its own words: the currency decides whether
        // any of this can be turned into taka at all.
        $acct = $this->account($account, $token);
        if (isset($acct['error'])) {
            return $this->fail($days, $acct['error']);
        }

        $this->settings->noteAccount($acct['currency'], $acct['name']);

        $rate = $this->settings->rate();
        if ($rate === null) {
            return $this->fail($days, sprintf(
                'The ad account bills in %s, not taka. Set how many taka one %s is worth and sync again — until then the spend cannot be added to taka revenue.',
                $acct['currency'] ?? 'another currency',
                $acct['currency'] ?? 'unit',
            ));
        }

        $since = now()->subDays($days - 1)->toDateString();
        $until = now()->toDateString();

        $rows = $this->insights($account, $token, $since, $until);
        if (isset($rows['error'])) {
            return $this->fail($days, $rows['error']);
        }

        $written = 0;
        $campaigns = [];
        $poisha = 0;

        foreach ($rows['data'] as $row) {
            $key = (string) ($row['campaign_id'] ?? '');
            $date = (string) ($row['date_start'] ?? '');
            if ($key === '' || $date === '') {
                continue;
            }

            $minor = (int) round(((float) ($row['spend'] ?? 0)) * 100);
            $taka = (int) round($minor * $rate);

            try {
                $existing = CampaignSpend::query()
                    ->where('campaign_key', $key)
                    ->where('spend_date', $date)
                    ->first();

                // See the class comment: a typed row is somebody's record of
                // money Meta cannot see, and a sync does not take it away.
                if ($existing !== null && $existing->source === 'manual') {
                    continue;
                }

                CampaignSpend::query()->updateOrCreate(
                    ['campaign_key' => $key, 'spend_date' => $date],
                    [
                        'campaign_name' => mb_substr((string) ($row['campaign_name'] ?? $key), 0, 191),
                        'spend_poisha'  => $taka,
                        'amount_minor'  => $minor,
                        'currency'      => $acct['currency'] ?? 'BDT',
                        'source'        => 'meta',
                        'synced_at'     => now(),
                    ],
                );

                $written++;
                $campaigns[$key] = true;
                $poisha += $taka;
            } catch (Throwable $e) {
                Log::warning('ad spend: could not record a day', ['campaign' => $key, 'date' => $date, 'error' => $e->getMessage()]);
            }
        }

        $this->settings->noteSync($days, null);

        return [
            'ok'        => true,
            'rows'      => $written,
            'campaigns' => count($campaigns),
            'spendTaka' => intdiv($poisha, 100),
            'currency'  => $acct['currency'],
            'days'      => $days,
            'message'   => null,
        ];
    }

    /**
     * Spend in a window, keyed by the utm_campaign it belongs to.
     *
     * The join everything rests on, and the one place it can go wrong: Meta
     * knows a campaign by its NAME, and the shop knows it by the utm_campaign
     * tag on the ad's link. They usually differ by punctuation alone, so the
     * two are compared with both flattened to lowercase dashes; where that is
     * not enough, the merchant maps the campaign by hand and the map wins.
     *
     * Spend that matches nothing is returned under its own key rather than
     * dropped — an ad whose link carries no utm tags is a real and common
     * fault, and one the merchant can only fix if the screen says so.
     *
     * @return array<string, array<string, mixed>>
     */
    public function byCampaign(string $from, string $to): array
    {
        $map = $this->settings->map();
        $out = [];

        try {
            $rows = CampaignSpend::query()->betweenDates($from, $to)->get();
        } catch (Throwable) {
            return [];
        }

        foreach ($rows as $row) {
            $key = $map[$row->campaign_key] ?? self::normalise($row->campaign_name);

            $out[$key] ??= [
                'utm'        => $key,
                'spendTaka'  => 0,
                'days'       => 0,
                'names'      => [],
                'keys'       => [],
                'manual'     => false,
            ];

            $out[$key]['spendTaka'] += $row->spendTaka();
            $out[$key]['days']++;
            $out[$key]['names'][$row->campaign_name] = true;
            $out[$key]['keys'][$row->campaign_key] = true;
            $out[$key]['manual'] = $out[$key]['manual'] || $row->source === 'manual';
        }

        foreach ($out as $key => $row) {
            $out[$key]['names'] = array_keys($row['names']);
            $out[$key]['keys'] = array_keys($row['keys']);
        }

        return $out;
    }

    /**
     * A campaign name and a utm_campaign tag, flattened until they can be
     * compared: "Sales BD — Cold (Sept 2026)" and "sales-bd-cold-sept-2026"
     * are the same campaign said by two people.
     */
    public static function normalise(?string $name): string
    {
        $flat = mb_strtolower(trim((string) $name));
        $flat = preg_replace('/[^a-z0-9\x{0980}-\x{09FF}]+/u', '-', $flat) ?? '';

        return trim($flat, '-');
    }

    /* ---- Meta ------------------------------------------------------------ */

    /** @return array<string, mixed> */
    private function account(string $id, string $token): array
    {
        try {
            $res = Http::timeout(self::TIMEOUT)->get(sprintf('https://graph.facebook.com/%s/act_%s', self::GRAPH, $id), [
                'fields'       => 'currency,name',
                'access_token' => $token,
            ]);

            if ($res->failed()) {
                return ['error' => $this->explain($res->json('error') ?? [], $res->status())];
            }

            return ['currency' => $res->json('currency'), 'name' => $res->json('name')];
        } catch (Throwable $e) {
            return ['error' => 'Meta could not be reached just now: ' . $e->getMessage()];
        }
    }

    /** @return array<string, mixed> */
    private function insights(string $id, string $token, string $since, string $until): array
    {
        $data = [];
        $url = sprintf('https://graph.facebook.com/%s/act_%s/insights', self::GRAPH, $id);
        $params = [
            'level'          => 'campaign',
            'fields'         => 'campaign_id,campaign_name,spend',
            'time_increment' => 1,
            'time_range'     => json_encode(['since' => $since, 'until' => $until]),
            'limit'          => 500,
            'access_token'   => $token,
        ];

        try {
            for ($page = 0; $page < self::MAX_PAGES; $page++) {
                $res = $page === 0
                    ? Http::timeout(self::TIMEOUT)->get($url, $params)
                    : Http::timeout(self::TIMEOUT)->get($url);

                if ($res->failed()) {
                    return ['error' => $this->explain($res->json('error') ?? [], $res->status())];
                }

                foreach ((array) $res->json('data', []) as $row) {
                    $data[] = $row;
                }

                $next = $res->json('paging.next');
                if (! is_string($next) || $next === '') {
                    break;
                }
                $url = $next;
                $params = [];
            }
        } catch (Throwable $e) {
            return ['error' => 'Meta could not be reached just now: ' . $e->getMessage()];
        }

        return ['data' => $data];
    }

    /**
     * Meta's refusal, in words a merchant can act on.
     *
     * @param array<string, mixed> $error
     */
    private function explain(array $error, int $status): string
    {
        $code = (int) ($error['code'] ?? 0);
        $sub = (int) ($error['error_subcode'] ?? 0);
        $said = trim((string) ($error['message'] ?? ''));

        $plain = match (true) {
            $code === 190 => 'The access token has expired or been revoked. Generate a new one and save it.',
            $code === 200 || $code === 10 || $code === 3 || $sub === 1487204 =>
                'The token is valid but is not allowed to read this ad account\'s spend. It needs the ads_read permission — a Conversions API token from Events Manager often does not have it. Generate a System User token with ads_read in Business Settings and save it here.',
            $code === 100 =>
                'Meta did not recognise that ad account id, or the token belongs to a different business. Check the number against Ads Manager.',
            $code === 17 || $code === 4 || $code === 613 =>
                'Meta is rate-limiting this account for the moment. The next sync will pick up where this one stopped.',
            $status >= 500 => 'Meta\'s API is having trouble. Nothing is wrong at this end; try again shortly.',
            default => 'Meta refused the request.',
        };

        return $said === '' ? $plain : $plain . ' Meta said: ' . mb_substr($said, 0, 200);
    }

    /** @return array<string, mixed> */
    private function fail(int $days, string $message): array
    {
        $this->settings->noteSync($days, $message);

        return [
            'ok' => false, 'rows' => 0, 'campaigns' => 0, 'spendTaka' => 0,
            'currency' => null, 'days' => $days, 'message' => $message,
        ];
    }
}
