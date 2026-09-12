<?php

declare(strict_types=1);

namespace Modules\Marketing\Services;

use Modules\Marketing\Models\MarketingSetting;
use Throwable;

/**
 * Which ad account the spend comes from, and what it is worth in taka.
 *
 * Owns ONE row of `marketing_settings`, the `meta_ads` key, the way
 * MetaPixelSettings owns `meta_pixel`. Same table, same encryption at rest,
 * separate keys: the two are saved on different screens by different people
 * and a shared row would mean one screen's save silently rewriting the other's.
 *
 * THE TOKEN IS USUALLY THE ONE ALREADY SAVED
 * ------------------------------------------
 * Reading spend needs `ads_read`, which a Conversions API token generated in
 * Events Manager may or may not carry. So the token here is optional: without
 * one, the Conversions API token is tried, and if Meta refuses for want of a
 * permission the screen says exactly that rather than "sync failed". A shop
 * that has to generate a second token should be told why, once, in words.
 *
 * CURRENCY IS DISCOVERED, NEVER TYPED
 * -----------------------------------
 * The ad account's currency comes from Meta itself on each sync. If it is not
 * BDT the merchant sets one number - taka per unit - and every row is
 * converted at the rate in force when it was written. Changing the rate later
 * does not rewrite history; a re-sync does, deliberately.
 */
final class AdSpendSettings
{
    public const KEY = 'meta_ads';

    private const UNREADABLE_ROW = 'The ad account settings saved here can no longer be read: the website\'s '
        . 'encryption key has changed since they were saved. Save the ad account id again to replace them.';

    public function __construct(private readonly MetaPixelSettings $pixel)
    {
    }

    /**
     * What the screen shows. Never the token itself - only whether there is
     * one and where it came from.
     *
     * @return array<string, mixed>
     */
    public function current(): array
    {
        $row = $this->row();

        return [
            'accountId'   => $row['accountId'] ?? null,
            'hasOwnToken' => ($row['token'] ?? null) !== null,
            'currency'    => $row['currency'] ?? null,
            'accountName' => $row['accountName'] ?? null,
            'takaPerUnit' => $row['takaPerUnit'] ?? null,
            'map'         => $row['map'] ?? [],
            'lastSyncAt'  => $row['lastSyncAt'] ?? null,
            'lastSyncDays' => $row['lastSyncDays'] ?? null,
            'lastError'   => $row['lastError'] ?? null,
            'problem'     => $this->problem,
            // Whether a sync can even be attempted, and what is missing if not.
            'ready'       => ($row['accountId'] ?? null) !== null && $this->token() !== null,
            'tokenSource' => ($row['token'] ?? null) !== null ? 'own' : ($this->pixelToken() !== null ? 'pixel' : null),
        ];
    }

    /** The token a sync should use: this screen's, or the Conversions API one. */
    public function token(): ?string
    {
        $own = $this->row()['token'] ?? null;

        return is_string($own) && $own !== '' ? $own : $this->pixelToken();
    }

    public function accountId(): ?string
    {
        $id = $this->row()['accountId'] ?? null;

        return is_string($id) && $id !== '' ? $id : null;
    }

    /**
     * Taka for one unit of the account's currency. 1 when the account bills in
     * taka, null when it bills in something else and nobody has said what it
     * is worth - which is a report the screen must refuse to compute rather
     * than quietly add dollars to taka.
     */
    public function rate(): ?float
    {
        $row = $this->row();
        $currency = $row['currency'] ?? null;

        if ($currency === 'BDT') {
            return 1.0;
        }

        $rate = $row['takaPerUnit'] ?? null;

        return is_numeric($rate) && (float) $rate > 0 ? (float) $rate : null;
    }

    /**
     * The utm_campaign a Meta campaign is tagged with, where the two names do
     * not match on their own.
     *
     * @return array<string, string>
     */
    public function map(): array
    {
        $map = $this->row()['map'] ?? [];

        return is_array($map) ? $map : [];
    }

    /** @return array<string, mixed> */
    public function save(string $accountId, ?string $token, bool $removeToken, ?string $takaPerUnit, string $by): array
    {
        $row = $this->row();

        // act_1234 and 1234 are the same account said two ways; Meta's API
        // wants the prefix and merchants copy whichever their screen showed.
        $accountId = preg_replace('/[^0-9]/', '', $accountId) ?? '';

        $row['accountId'] = $accountId === '' ? null : $accountId;

        if ($removeToken) {
            $row['token'] = null;
        } elseif (is_string($token) && trim($token) !== '') {
            $row['token'] = trim($token);
        }

        if ($takaPerUnit !== null) {
            $row['takaPerUnit'] = trim($takaPerUnit) === '' ? null : (float) $takaPerUnit;
        }

        $this->write($row, $by);

        return $this->current();
    }

    /** @param array<string, string> $map */
    public function saveMap(array $map, string $by): array
    {
        $row = $this->row();
        $row['map'] = $map;
        $this->write($row, $by);

        return $this->current();
    }

    /** What the account turned out to be, learned from Meta on a sync. */
    public function noteAccount(?string $currency, ?string $name): void
    {
        $row = $this->row();
        $row['currency'] = $currency;
        $row['accountName'] = $name;
        $this->write($row, 'sync');
    }

    public function noteSync(int $days, ?string $error): void
    {
        $row = $this->row();
        $row['lastSyncAt'] = now()->toDateTimeString();
        $row['lastSyncDays'] = $days;
        $row['lastError'] = $error;
        $this->write($row, 'sync');
    }

    /* ---- storage --------------------------------------------------------- */

    /** @var array<string, mixed>|null */
    private ?array $cache = null;

    private ?string $problem = null;

    /** @return array<string, mixed> */
    private function row(): array
    {
        if ($this->cache !== null) {
            return $this->cache;
        }

        try {
            $row = MarketingSetting::query()->find(self::KEY);
            $this->cache = is_array($row?->value) ? $row->value : [];
        } catch (Throwable $e) {
            // A row encrypted with a key that has since changed throws on
            // read. Saying so is the whole difference between "set this up"
            // and "you did set it up, and it cannot be read".
            $this->problem = str_contains($e->getMessage(), 'payload') ? self::UNREADABLE_ROW : null;
            $this->cache = [];
        }

        return $this->cache;
    }

    /** @param array<string, mixed> $row */
    private function write(array $row, string $by): void
    {
        try {
            MarketingSetting::query()->updateOrCreate(
                ['key' => self::KEY],
                ['value' => $row, 'updated_by' => mb_substr($by, 0, 120)],
            );
            $this->cache = $row;
        } catch (Throwable) {
            // Saving is the caller's business to report; a settings write that
            // fails must not take a sync's own result down with it.
            $this->cache = null;
        }
    }

    private function pixelToken(): ?string
    {
        try {
            $token = $this->pixel->forTracking()['accessToken'] ?? null;

            return is_string($token) && $token !== '' ? $token : null;
        } catch (Throwable) {
            return null;
        }
    }
}
