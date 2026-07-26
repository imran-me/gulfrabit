<?php

declare(strict_types=1);

namespace Modules\Cart\Seeders;

use Illuminate\Database\Seeder;
use Modules\Cart\Models\Promotion;

/**
 * The launch promo codes. Values in poisha.
 *
 * These mirror the two codes the frontend mock knows (GULF10, HOP500) so the
 * seeded database behaves exactly like the pre-backend storefront.
 */
class PromotionSeeder extends Seeder
{
    public function run(): void
    {
        $promotions = [
            [
                'code'                => 'GULF10',
                'label'               => '10% off your order',
                'type'                => 'pct',
                'value'               => 10,
                'min_subtotal_poisha' => 100_000,      // BDT 1,000
                'max_discount_poisha' => 100_000,      // capped at BDT 1,000
            ],
            [
                'code'                => 'HOP500',
                'label'               => 'BDT 500 off',
                'type'                => 'flat',
                'value'               => 50_000,       // BDT 500
                'min_subtotal_poisha' => 300_000,      // BDT 3,000
                'max_discount_poisha' => null,
            ],
        ];

        foreach ($promotions as $promo) {
            Promotion::updateOrCreate(['code' => $promo['code']], $promo + ['is_active' => true]);
        }
    }
}
