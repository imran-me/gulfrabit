<?php

declare(strict_types=1);

namespace Modules\Media\Console;

use Illuminate\Console\Command;
use Modules\Media\Models\MediaAsset;
use Modules\Media\Services\ImageStore;

/**
 * Write the small copies for images uploaded before ImageStore made them.
 *
 * WHY THIS HAS TO BE RUN, and run BEFORE anything starts asking for a tier by
 * name: the storefront derives a tier URL from the master's path rather than
 * being told it. That is the right trade — every consumer stores a plain path
 * string and nothing holds a relation to media, which is what lets the module
 * be deleted without breaking a product — but it means a derived URL that does
 * not exist is a 404 inside a <picture><source>, and a <source> that fails
 * does NOT fall back to the <img>. It shows a broken image.
 *
 * So: run this once, on the server, after deploying. It is idempotent, it
 * never touches a master, and it can be run again any time.
 *
 *     php artisan media:tiers
 *     php artisan media:tiers --dry-run
 */
class BackfillTiers extends Command
{
    protected $signature = 'media:tiers {--dry-run : List what is missing and change nothing}';

    protected $description = 'Write the card and thumb copies for existing library images';

    public function handle(ImageStore $store): int
    {
        $dry = (bool) $this->option('dry-run');

        $assets = MediaAsset::query()->orderBy('id')->get();

        if ($assets->isEmpty()) {
            $this->info('The library is empty — nothing to do.');

            return self::SUCCESS;
        }

        $done = 0;
        $skipped = 0;
        $failed = 0;

        $bar = $this->output->createProgressBar($assets->count());
        $bar->start();

        foreach ($assets as $asset) {
            $bar->advance();

            $absolute = public_path(ltrim($asset->path, '/'));

            if (! is_file($absolute)) {
                // A row whose file is gone. Reported, not repaired: inventing
                // a placeholder would hide a real problem behind a grey square.
                $failed++;
                continue;
            }

            // Already has both? Then there is nothing to decode, which is what
            // makes re-running this cheap.
            $missing = collect(['-card', '-thumb'])
                ->reject(fn (string $s): bool => is_file(
                    public_path(ltrim($store->tierPath($asset->path, $s), '/'))
                ));

            if ($missing->isEmpty()) {
                $skipped++;
                continue;
            }

            if ($dry) {
                $done++;
                continue;
            }

            $image = @imagecreatefromwebp($absolute);

            if ($image === false) {
                $failed++;
                continue;
            }

            try {
                $store->writeTiers($image, $asset->path);
                $done++;
            } finally {
                imagedestroy($image);
            }
        }

        $bar->finish();
        $this->newLine(2);

        $this->info(sprintf(
            '%s %d image%s. %d already had their copies.',
            $dry ? 'Would write copies for' : 'Wrote copies for',
            $done,
            $done === 1 ? '' : 's',
            $skipped,
        ));

        if ($failed) {
            $this->warn(sprintf(
                '%d could not be read — the row points at a file that is missing or unreadable.',
                $failed
            ));
        }

        return self::SUCCESS;
    }
}
