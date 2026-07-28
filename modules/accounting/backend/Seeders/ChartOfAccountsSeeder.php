<?php

declare(strict_types=1);

namespace Modules\Accounting\Seeders;

use Illuminate\Database\Seeder;
use Modules\Accounting\Models\Account;
use RuntimeException;

/**
 * Seeds the starting chart of accounts from the module's own JSON.
 *
 * Idempotent and deliberately non-destructive about `name` on re-run: a
 * merchant who renamed "Sales revenue" to whatever their accountant calls it
 * must not have that undone by a deploy. Type and system_key ARE re-asserted,
 * because those are what the posting rules depend on.
 *
 * NO OPENING BALANCES. They are a fact about this business on a particular
 * date and only the owner has them; seeding zeroes would look like a real
 * starting position rather than an absent one.
 */
class ChartOfAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $path = dirname(__DIR__, 2) . '/data/chart-of-accounts.json';

        if (! is_readable($path)) {
            throw new RuntimeException("chart-of-accounts.json not readable at {$path}");
        }

        $payload = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        foreach ($payload['accounts'] ?? [] as $row) {
            $existing = Account::query()->where('code', $row['code'])->first();

            Account::updateOrCreate(
                ['code' => $row['code']],
                [
                    // Keep a name the merchant changed; set it on first create.
                    'name'        => $existing?->name ?? $row['name'],
                    'type'        => $row['type'],
                    'system_key'  => $row['systemKey'] ?? null,
                    'is_system'   => ! empty($row['systemKey']),
                    'is_active'   => true,
                    'description' => $row['description'] ?? null,
                ],
            );
        }
    }
}
