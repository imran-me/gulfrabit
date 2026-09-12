<?php

declare(strict_types=1);

namespace Modules\Marketing\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * One campaign's spend for one day.
 *
 * Written by MetaAdSpend on a sync, or by hand from the Campaigns screen when
 * Meta has nothing to say about a campaign - a boosted post, a different ad
 * account, an influencer paid in cash.
 */
class CampaignSpend extends Model
{
    protected $table = 'campaign_spend';

    protected $fillable = [
        'campaign_key', 'campaign_name', 'spend_date',
        'spend_poisha', 'amount_minor', 'currency', 'source', 'synced_at',
    ];

    protected function casts(): array
    {
        return [
            'spend_date'   => 'date',
            'spend_poisha' => 'integer',
            'amount_minor' => 'integer',
            'synced_at'    => 'datetime',
        ];
    }

    /**
     * Spend inside a window, by date rather than by timestamp: a day's spend
     * belongs to that day whatever hour the sync happened to write it.
     */
    public function scopeBetweenDates(Builder $q, string $from, string $to): Builder
    {
        return $q->where('spend_date', '>=', $from)->where('spend_date', '<=', $to);
    }

    public function spendTaka(): int
    {
        return intdiv($this->spend_poisha, 100);
    }
}
