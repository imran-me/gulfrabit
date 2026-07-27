<?php

declare(strict_types=1);

namespace Modules\Admin\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Modules\Admin\Models\AdminUser;
use RuntimeException;

/**
 * Creates the first owner account.
 *
 * NO DEFAULT PASSWORD. Seeders that ship `admin/admin123` are how storefronts
 * get taken over in week one, because the credential outlives every intention
 * to change it. This reads ADMIN_EMAIL and ADMIN_PASSWORD from the environment,
 * and if no password is set it generates a strong one and PRINTS IT ONCE — so
 * the only way to end up with a weak admin password is to type one deliberately.
 */
class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $email = env('ADMIN_EMAIL');

        if (! $email) {
            throw new RuntimeException(
                'Set ADMIN_EMAIL in .env before seeding the admin account.'
            );
        }

        if (AdminUser::query()->where('email', $email)->exists()) {
            $this->command?->info("Admin {$email} already exists — left untouched.");
            return;
        }

        $password = env('ADMIN_PASSWORD');
        $generated = false;

        if (! $password) {
            $password = Str::password(20);
            $generated = true;
        }

        AdminUser::create([
            'name'      => env('ADMIN_NAME', 'Owner'),
            'email'     => $email,
            'password'  => Hash::make($password),
            'role'      => 'owner',
            'is_active' => true,
        ]);

        if ($generated) {
            $this->command?->warn('Generated admin password (shown once, store it now):');
            $this->command?->line("  {$password}");
        }
    }
}
