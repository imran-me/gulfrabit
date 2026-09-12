<?php

declare(strict_types=1);

namespace Modules\Marketing\Console;

use Illuminate\Console\Command;
use Modules\Marketing\Services\MetaAdSpend;

/**
 * Read the last few days of ad spend from Meta into `campaign_spend`.
 *
 * WHY IT RUNS ON A SCHEDULE AND NOT ONLY ON A BUTTON
 * --------------------------------------------------
 * The Campaigns screen has a Sync button, and a merchant who only ever looks
 * at this month's numbers is served by it. The scheduled run is for the
 * opposite case: the day somebody asks "what did that campaign in Ramadan
 * actually cost per delivered order" and nobody pressed the button that week.
 * Spend that was never pulled cannot be pulled for a window Meta has since
 * aggregated away from the granularity we want.
 *
 * Re-reading the last seven days on every run is deliberate: Meta revises a
 * day's spend for a day or two afterwards, and the unique key on campaign and
 * date makes re-writing the same day free.
 *
 *     php artisan marketing:ad-spend-sync
 *     php artisan marketing:ad-spend-sync --days=30
 *
 * Add it to cron beside deploy.sh, once a day is plenty:
 *     0 4 * * * cd <app> && php artisan marketing:ad-spend-sync >/dev/null 2>&1
 */
class SyncAdSpend extends Command
{
    protected $signature = 'marketing:ad-spend-sync {--days=7 : How many days back to re-read, 1-90}';

    protected $description = 'Read ad spend per campaign per day from Meta into the shop\'s own table';

    public function handle(MetaAdSpend $spend): int
    {
        $result = $spend->sync((int) $this->option('days'));

        if (! $result['ok']) {
            // A message, not a stack trace: whoever reads this is a merchant
            // looking at a cron mail, not a developer.
            $this->error($result['message']);

            return self::FAILURE;
        }

        $this->info(sprintf(
            '%d day-rows across %d campaigns, %s taka of spend over the last %d days.',
            $result['rows'],
            $result['campaigns'],
            number_format($result['spendTaka']),
            $result['days'],
        ));

        return self::SUCCESS;
    }
}
