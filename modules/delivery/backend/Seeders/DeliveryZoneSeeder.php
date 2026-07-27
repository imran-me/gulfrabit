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
    public function run(): void
    {
        foreach ($this->zonesFromJson() as $zone) {
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
     * Zones from modules/delivery/data/zones.json — the single source.
     *
     * These rates used to be a PHP constant here AND a JS constant in api.js
     * AND hand-written into three pieces of markup. Five copies of three
     * numbers; the first one missed becomes a promise the site does not keep.
     * tools/sync-delivery-copy.py generates the other four from that file, and
     * this reads it directly.
     *
     * @return array<int, array{key:string,label:string,eta_text:string,charge_poisha:int,sort_order:int,is_active:bool}>
     */
    private function zonesFromJson(): array
    {
        $path = __DIR__ . '/../../data/zones.json';

        if (! is_file($path)) {
            throw new RuntimeException("Missing {$path} — the delivery module owns this file.");
        }

        $payload = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        return array_map(static fn (array $z): array => [
            'key'           => $z['key'],
            'label'         => $z['label'],
            'eta_text'      => $z['eta'],
            // Taka in the JSON (what a human edits), poisha in the database.
            'charge_poisha' => (int) $z['costTaka'] * 100,
            'sort_order'    => (int) ($z['sortOrder'] ?? 0),
            'is_active'     => (bool) ($z['isActive'] ?? true),
        ], $payload['zones'] ?? []);
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
