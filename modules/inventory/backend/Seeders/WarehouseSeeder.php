<?php

declare(strict_types=1);

namespace Modules\Inventory\Seeders;

use Illuminate\Database\Seeder;
use Modules\Inventory\Models\Warehouse;

/**
 * One warehouse to start with.
 *
 * Seeded rather than assumed: every stock level and movement needs a warehouse
 * id, and a system that invents one implicitly has nowhere to put the second.
 */
class WarehouseSeeder extends Seeder
{
    public function run(): void
    {
        Warehouse::updateOrCreate(
            ['key' => 'main'],
            [
                'name'       => 'Main store',
                'district'   => 'Dhaka',
                'is_default' => true,
                'is_active'  => true,
            ],
        );
    }
}
