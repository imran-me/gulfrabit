<?php

declare(strict_types=1);

namespace Modules\Marketing\Console;

use Illuminate\Console\Command;
use Modules\Marketing\Services\MetaPixelSettings;
use Modules\Marketing\Services\PixelStamp;
use Throwable;

/**
 * Write the pixel saved in Admin → Pixel setup into every storefront page.
 *
 * WHY THIS HAS TO RUN ON EVERY DEPLOY
 * -----------------------------------
 * The deploy is `git reset --hard origin/main`, which puts back the pages as
 * they were committed — carrying the pixel id the BUILD wrote, from
 * site-config.js. A pixel changed in the panel since then would quietly revert
 * the moment the next deploy landed, and the shop's ads would go on spending
 * against a pixel that no longer receives anything. deploy.sh runs this right
 * after the migrations to put the panel's id back.
 *
 * Safe to run any time: it changes nothing when nothing is saved in the panel,
 * and it only rewrites a page whose bytes differ.
 *
 *     php artisan marketing:pixel-stamp
 *     php artisan marketing:pixel-stamp --check
 */
class StampPixel extends Command
{
    protected $signature = 'marketing:pixel-stamp {--check : Report what the pages carry and change nothing}';

    protected $description = 'Write the pixel saved in Admin → Pixel setup into every storefront page';

    public function handle(MetaPixelSettings $settings, PixelStamp $stamp): int
    {
        $c = $settings->current();

        if ($c['problem'] !== null) {
            $this->warn($c['problem']);
        }

        if ($this->option('check')) {
            return $this->check($c, $stamp);
        }

        if ($c['source'] !== 'panel') {
            $this->info('Nothing is saved in Admin → Pixel setup, so the pages keep the pixel they were built with.');

            return self::SUCCESS;
        }

        $id = $c['pixelId'] ?? '';

        try {
            $result = $stamp->apply($id);
        } catch (Throwable $e) {
            // Only when the block itself cannot be made — PixelStamp promises
            // no page was touched.
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info(sprintf(
            'Pixel %s: %d page%s checked, %d changed.',
            $id === '' ? 'switched off' : $id,
            $result['pages'],
            $result['pages'] === 1 ? '' : 's',
            $result['changed'],
        ));

        foreach ($result['failed'] as $page => $why) {
            $this->error("  {$page}: {$why}");
        }

        return $result['failed'] === [] ? self::SUCCESS : self::FAILURE;
    }

    /**
     * What every page carries against what the panel says it should.
     * Reports only; the exit code is 0 whatever it finds.
     *
     * @param array<string, mixed> $c
     */
    private function check(array $c, PixelStamp $stamp): int
    {
        $survey = $stamp->survey();

        $this->info(sprintf('%d storefront page%s carry the pixel block.', $survey['total'], $survey['total'] === 1 ? '' : 's'));

        foreach ($survey['ids'] as $id => $count) {
            $this->line(sprintf('  %-20s %d', (string) $id === '' ? '(switched off)' : (string) $id, $count));
        }

        if ($survey['unknown'] > 0) {
            $this->line(sprintf('  %-20s %d', '(unreadable block)', $survey['unknown']));
        }

        if ($c['source'] !== 'panel') {
            $this->info('Nothing is saved in Admin → Pixel setup, so the pages keep the pixel they were built with.');

            return self::SUCCESS;
        }

        $want = $c['pixelId'] ?? '';
        $matching = 0;

        foreach ($survey['ids'] as $id => $count) {
            if ((string) $id === $want) {
                $matching += $count;
            }
        }

        $this->info(sprintf(
            'The panel says %s: %d of %d page%s match.%s',
            $want === '' ? 'switched off' : $want,
            $matching,
            $survey['total'],
            $survey['total'] === 1 ? '' : 's',
            $matching === $survey['total'] ? '' : ' Run without --check to fix the rest.',
        ));

        return self::SUCCESS;
    }
}
