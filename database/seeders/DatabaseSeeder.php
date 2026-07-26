<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Cart\Seeders\GiftRewardSeeder;
use Modules\Cart\Seeders\PromotionSeeder;
use Modules\Catalog\Seeders\CatalogSeeder;
use Modules\Delivery\Seeders\DeliveryZoneSeeder;

/**
 * Seeds every module, in dependency order.
 *
 * Delivery first (catalog does not need it, but checkout does), then catalog,
 * then promotions. Each module owns its own seeder and its own source data;
 * this file only decides the order.
 *
 *   php artisan db:seed
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            DeliveryZoneSeeder::class,
            CatalogSeeder::class,
            PromotionSeeder::class,
            // Must run AFTER CatalogSeeder — a gift points at a real product.
            GiftRewardSeeder::class,
        ]);
    }
}
