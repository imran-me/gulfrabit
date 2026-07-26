<?php

declare(strict_types=1);

namespace Modules\Account;

use Illuminate\Support\ServiceProvider;
use Modules\Account\Services\AddressService;

/**
 * Account module wiring.
 *
 * Depends on Catalog (wishlist points at products) and Delivery (an address
 * belongs to a district, which is what prices it). One-way: neither knows
 * account exists.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Account\AccountServiceProvider::class,
 */
class AccountServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(AddressService::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

        $this->app->booted(function (): void {
            if ($this->app->routesAreCached()) {
                return;
            }

            $this->app['router']
                ->middleware('api')
                ->prefix('api')
                ->group(__DIR__ . '/routes.php');
        });
    }
}
