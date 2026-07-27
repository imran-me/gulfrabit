<?php

declare(strict_types=1);

namespace Modules\Courier\Seeders;

use Illuminate\Database\Seeder;
use Modules\Courier\Models\Courier;
use RuntimeException;

/**
 * Seeds the carriers from the module's own data/couriers.json — the same file
 * the storefront reads while it is still on mock data.
 *
 * Idempotent, and deliberately NON-destructive about two fields: `credentials`
 * and `is_configured` are never written here. Re-running the seeder after
 * someone has connected Pathao must not wipe the API key and quietly switch the
 * integration off.
 */
class CourierSeeder extends Seeder
{
    public function run(): void
    {
        foreach ($this->fromJson() as $row) {
            Courier::updateOrCreate(
                ['key' => $row['key']],
                [
                    'name'                  => $row['name'],
                    'driver'                => $row['driver'],
                    'tracking_url_template' => $row['trackingUrlTemplate'] ?? null,
                    'support_phone'         => $row['supportPhone'] ?? null,
                    'sort_order'            => $row['sortOrder'] ?? 0,
                    'is_active'             => true,
                ],
            );
        }
    }

    /** @return array<int, array<string, mixed>> */
    private function fromJson(): array
    {
        $path = dirname(__DIR__, 2) . '/data/couriers.json';

        if (! is_readable($path)) {
            throw new RuntimeException("couriers.json not readable at {$path}");
        }

        $payload = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        foreach ($payload['couriers'] ?? [] as $c) {
            if (isset($c['isConfigured']) && $c['isConfigured']) {
                // The data file must never claim credentials exist. That flag
                // is a fact about the environment, not about the catalogue of
                // couriers.
                throw new RuntimeException("couriers.json must not set isConfigured (on '{$c['key']}').");
            }
        }

        return $payload['couriers'] ?? [];
    }
}
