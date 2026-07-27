<?php

declare(strict_types=1);

namespace Modules\Bundle\Seeders;

use Illuminate\Database\Seeder;
use Modules\Bundle\Models\ProductBundle;
use RuntimeException;

/**
 * Seeds the curated pairings from the module's own data/bundles.json — the same
 * file the storefront reads while it is still on mock data. One source, so the
 * seeded database and the pre-backend frontend cannot disagree about what goes
 * with what.
 *
 * Idempotent: keyed on `key`, so re-running updates rather than duplicates.
 */
class ProductBundleSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->bundlesFromJson() as $order => $bundle) {
            ProductBundle::updateOrCreate(
                ['key' => $bundle['id']],
                [
                    'title'      => $bundle['title'],
                    'reason'     => $bundle['reason'],
                    'members'    => $bundle['members'],
                    // File order is the merchant's priority — the first bundle
                    // containing a product is the one that shows on its page —
                    // so it has to survive into the table.
                    'sort_order' => $order,
                    'is_active'  => true,
                ],
            );
        }
    }

    /** @return array<int, array{id:string,title:string,reason:string,members:array<int,string>}> */
    private function bundlesFromJson(): array
    {
        $path = dirname(__DIR__, 2) . '/data/bundles.json';

        if (! is_readable($path)) {
            throw new RuntimeException("bundles.json not readable at {$path}");
        }

        $payload = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $bundles = $payload['bundles'] ?? [];

        foreach ($bundles as $bundle) {
            // A pairing with no stated reason is not shippable — the reason is
            // the only thing standing behind it before there is purchase data.
            // Fail the seed rather than let a blank one reach a product page.
            if (trim((string) ($bundle['reason'] ?? '')) === '') {
                throw new RuntimeException("bundle '{$bundle['id']}' has no reason.");
            }

            if (count($bundle['members'] ?? []) < 2) {
                throw new RuntimeException("bundle '{$bundle['id']}' needs at least two members.");
            }
        }

        return $bundles;
    }
}
