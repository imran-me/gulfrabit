<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Accounting\Seeders\ChartOfAccountsSeeder;
use Modules\Admin\Seeders\AdminUserSeeder;
use Modules\Bundle\Seeders\ProductBundleSeeder;
use Modules\Cart\Seeders\GiftRewardSeeder;
use Modules\Cart\Seeders\PromotionSeeder;
use Modules\Catalog\Seeders\CatalogSeeder;
use Modules\Courier\Seeders\CourierSeeder;
use Modules\Delivery\Seeders\DeliveryZoneSeeder;
use Modules\Inventory\Seeders\WarehouseSeeder;

/**
 * Seeds every module, in dependency order.
 *
 * EVERY SEEDER MUST BE LISTED HERE OR IT SILENTLY NEVER RUNS
 * ----------------------------------------------------------
 * This file is the one place outside a module that has to know the module
 * exists — the same deal as composer.json and bootstrap/providers.php. Five
 * seeders were written and never added here, and nothing complained: the first
 * production seed reported success having created no admin account, no
 * couriers, no warehouse and no chart of accounts. A seeder that is not called
 * produces no error, which makes this the easiest file in the project to
 * forget.
 *
 * `tools/php-check.py` now fails when a Seeder class exists and is not
 * referenced here, so the next one cannot be forgotten quietly.
 *
 *   php artisan db:seed
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            // ---- Reference data, in dependency order --------------------
            // Delivery first (checkout needs zones), then the catalogue.
            DeliveryZoneSeeder::class,
            CatalogSeeder::class,

            // Must run AFTER CatalogSeeder — each points at a real product.
            PromotionSeeder::class,
            GiftRewardSeeder::class,
            ProductBundleSeeder::class,

            // ---- Operations ---------------------------------------------
            // Carriers: all on the manual driver, none claiming credentials.
            CourierSeeder::class,
            // One warehouse, so stock levels and movements have somewhere to
            // point. Nothing in inventory works without it.
            WarehouseSeeder::class,

            // ---- The books ----------------------------------------------
            // Chart of accounts only. NO opening balances — those are a fact
            // about this business on a date, and seeding zeroes would look
            // like a real starting position.
            ChartOfAccountsSeeder::class,

            // ---- Staff ---------------------------------------------------
            // Last, and the only one that prints something you must keep: with
            // no ADMIN_PASSWORD in .env it generates one and shows it once.
            AdminUserSeeder::class,
        ]);
    }
}
