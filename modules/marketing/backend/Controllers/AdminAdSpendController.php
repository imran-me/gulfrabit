<?php

declare(strict_types=1);

namespace Modules\Marketing\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Marketing\Models\CampaignSpend;
use Modules\Marketing\Services\AdSpendSettings;
use Modules\Marketing\Services\MetaAdSpend;
use Throwable;

/**
 * Ad spend: where it is read from, and the rows themselves.
 *
 * Reading the report needs the orders capability, the same as the campaign
 * figures it sits beside. Changing where the money comes from - an account id,
 * an access token, an exchange rate - needs the settings capability, because
 * it is a credential and a number that rewrites every cost-per-order on the
 * screen.
 */
class AdminAdSpendController extends Controller
{
    public function __construct(
        private readonly AdSpendSettings $settings,
        private readonly MetaAdSpend $spend,
    ) {
    }

    /** The setup, and the days already stored. */
    public function show(Request $request): JsonResponse
    {
        $days = (int) $request->query('days', 30);
        $days = in_array($days, [7, 30, 90, 365], true) ? $days : 30;
        $from = now()->subDays($days - 1)->toDateString();
        $to = now()->toDateString();

        return response()->json(['data' => [
            'settings' => $this->settings->current(),
            'rows'     => $this->rows($from, $to),
            'byCampaign' => array_values($this->spend->byCampaign($from, $to)),
            'days'     => $days,
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'accountId'   => ['required', 'string', 'max:40'],
            'token'       => ['sometimes', 'nullable', 'string', 'max:512'],
            'removeToken' => ['sometimes', 'boolean'],
            'takaPerUnit' => ['sometimes', 'nullable', 'numeric', 'between:0,100000'],
        ]);

        return response()->json(['data' => $this->settings->save(
            $data['accountId'],
            $data['token'] ?? null,
            (bool) ($data['removeToken'] ?? false),
            isset($data['takaPerUnit']) ? (string) $data['takaPerUnit'] : null,
            (string) ($request->user()?->name ?? 'panel'),
        )]);
    }

    /**
     * Pull now.
     *
     * Throttled: each press is a call to Meta, and a screen with a button on
     * it will be pressed twice by anyone waiting for a number to change.
     */
    public function sync(Request $request): JsonResponse
    {
        $result = $this->spend->sync((int) $request->input('days', 7));

        // 200 either way: a refusal from Meta is an ANSWER this screen has to
        // show in words, not an error for the browser's console to swallow.
        return response()->json(['data' => $result + ['settings' => $this->settings->current()]]);
    }

    /** A day of spend Meta cannot see - a boosted post, cash to an influencer. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'campaign'  => ['required', 'string', 'max:191'],
            'spendDate' => ['required', 'date_format:Y-m-d'],
            'taka'      => ['required', 'numeric', 'min:0', 'max:100000000'],
        ]);

        $key = 'manual:' . MetaAdSpend::normalise($data['campaign']);

        CampaignSpend::query()->updateOrCreate(
            ['campaign_key' => $key, 'spend_date' => $data['spendDate']],
            [
                'campaign_name' => $data['campaign'],
                'spend_poisha'  => (int) round(((float) $data['taka']) * 100),
                'amount_minor'  => (int) round(((float) $data['taka']) * 100),
                'currency'      => 'BDT',
                'source'        => 'manual',
                'synced_at'     => null,
            ],
        );

        return $this->show($request);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        try {
            CampaignSpend::query()->whereKey($id)->where('source', 'manual')->delete();
        } catch (Throwable) {
            // Already gone is the outcome the caller wanted.
        }

        return $this->show($request);
    }

    /**
     * Tie a Meta campaign to the utm_campaign its links carry, for the ones
     * whose names do not match on their own.
     */
    public function map(Request $request): JsonResponse
    {
        $data = $request->validate([
            'map'   => ['required', 'array', 'max:200'],
            'map.*' => ['nullable', 'string', 'max:191'],
        ]);

        $clean = [];
        foreach ($data['map'] as $key => $utm) {
            $utm = trim((string) $utm);
            if ($utm !== '') {
                $clean[mb_substr((string) $key, 0, 191)] = mb_substr($utm, 0, 191);
            }
        }

        return response()->json(['data' => $this->settings->saveMap($clean, (string) ($request->user()?->name ?? 'panel'))]);
    }

    /** @return list<array<string, mixed>> */
    private function rows(string $from, string $to): array
    {
        try {
            return CampaignSpend::query()
                ->betweenDates($from, $to)
                ->orderByDesc('spend_date')
                ->orderBy('campaign_name')
                ->limit(400)
                ->get()
                ->map(fn (CampaignSpend $r): array => [
                    'id'        => $r->id,
                    'key'       => $r->campaign_key,
                    'campaign'  => $r->campaign_name,
                    'date'      => $r->spend_date?->toDateString(),
                    'taka'      => $r->spendTaka(),
                    'amount'    => $r->amount_minor / 100,
                    'currency'  => $r->currency,
                    'source'    => $r->source,
                ])
                ->all();
        } catch (Throwable) {
            return [];
        }
    }
}
