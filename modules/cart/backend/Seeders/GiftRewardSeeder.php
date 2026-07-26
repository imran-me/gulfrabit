<?php

declare(strict_types=1);

namespace Modules\Cart\Seeders;

use Illuminate\Database\Seeder;
use Modules\Cart\Models\GiftReward;
use Modules\Catalog\Models\Product;
use RuntimeException;

/**
 * Seeds gift thresholds from the module's own data/rewards.json, so the seeded
 * database and the pre-backend storefront cannot disagree about what the gift is.
 */
class GiftRewardSeeder extends Seeder
{
    public function run(): void
    {
        $path = __DIR__ . '/../../data/rewards.json';

        if (! is_file($path)) {
            throw new RuntimeException("Missing {$path} — the cart module owns this file.");
        }

        $payload = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        foreach ($payload['rewards'] ?? [] as $reward) {
            $product = Product::where('sku', $reward['productSku'])->first();

            if ($product === null) {
                throw new RuntimeException(
                    "Gift reward '{$reward['id']}' points at unknown SKU '{$reward['productSku']}'. "
                    . 'Seed the catalog first, or fix rewards.json.'
                );
            }

            GiftReward::updateOrCreate(
                ['key' => $reward['id']],
                [
                    'threshold_poisha' => (int) $reward['thresholdTaka'] * 100,
                    'product_id'       => $product->id,
                    'teaser'           => $reward['teaser'],
                    'is_active'        => (bool) ($reward['isActive'] ?? true),
                ],
            );
        }
    }
}
