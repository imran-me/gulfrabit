<?php

declare(strict_types=1);

namespace Modules\Delivery\Seeders;

use Illuminate\Database\Seeder;
use Modules\Delivery\Models\DeliveryZone;
use Modules\Delivery\Models\District;
use RuntimeException;

/**
 * Seeds zones and the 64 districts.
 *
 * Districts are read from the module's own data/districts.json — the same file
 * the storefront reads while it is still running on mock data. One source, so
 * the seeded database and the pre-backend frontend can never disagree about
 * which districts are metro.
 */
class DeliveryZoneSeeder extends Seeder
{
    /**
     * Charges in poisha. Flat per zone, whatever the order weighs or is worth —
     * see modules/delivery/README.md for why there is no free-delivery tier.
     */
    private const ZONES = [
        ['key' => 'metro',      'label' => 'Dhaka & Chattogram',  'eta_text' => 'Within 72 hours',   'charge_poisha' => 7_000,  'sort_order' => 1],
        ['key' => 'nationwide', 'label' => 'Rest of Bangladesh',  'eta_text' => '4 working days',    'charge_poisha' => 13_000, 'sort_order' => 2],
        ['key' => 'express',    'label' => 'Express — Dhaka only', 'eta_text' => 'Next working day', 'charge_poisha' => 15_000, 'sort_order' => 3],
    ];

    public function run(): void
    {
        foreach (self::ZONES as $zone) {
            DeliveryZone::updateOrCreate(['key' => $zone['key']], $zone);
        }

        $zoneIds = DeliveryZone::query()->pluck('id', 'key');

        foreach ($this->districtsFromJson() as $district) {
            $zoneKey = $district['zone'];

            if (! isset($zoneIds[$zoneKey])) {
                throw new RuntimeException(
                    "districts.json references unknown zone '{$zoneKey}' for '{$district['name']}'."
                );
            }

            District::updateOrCreate(
                ['key' => $district['id']],
                [
                    'name'             => $district['name'],
                    'division'         => $district['division'],
                    'delivery_zone_id' => $zoneIds[$zoneKey],
                ],
            );
        }
    }

    /**
     * @return array<int, array{id:string,name:string,division:string,zone:string}>
     */
    private function districtsFromJson(): array
    {
        $path = __DIR__ . '/../../data/districts.json';

        if (! is_file($path)) {
            throw new RuntimeException("Missing {$path} — the delivery module owns this file.");
        }

        $payload = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $districts = $payload['districts'] ?? [];

        if (count($districts) !== 64) {
            throw new RuntimeException(
                'Expected 64 districts, got ' . count($districts) . ' — districts.json is incomplete.'
            );
        }

        return $districts;
    }
}
