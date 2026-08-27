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
            /* The message names the config cache when it is on, because that
               is far and away the likeliest reason this fires on a server
               where ADMIN_EMAIL is plainly sitting in .env.

               A cached config means Laravel never loads .env at all, so env()
               returns null for a value you can see with your own eyes — and
               deploy.sh runs `config:cache` on every deploy, which makes that
               the NORMAL state of a live server rather than an edge case.
               Without this sentence the error sends you to look at the one
               file that is already correct. */
            throw new RuntimeException(
                'Set ADMIN_EMAIL in .env before seeding the admin account.'
                . (app()->configurationIsCached()
                    ? ' — but note this server is running a CACHED config, which means .env is '
                        . 'not read at all and env() returns null even when the value is there. '
                        . 'Run `php artisan config:clear`, seed, then `php artisan config:cache` '
                        . 'again. deploy.sh caches on every deploy, so this is the usual state '
                        . 'of a live server.'
                    : '')
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
