<?php

declare(strict_types=1);

namespace Modules\Courier;

use Illuminate\Support\ServiceProvider;
use Modules\Courier\Services\ConsignmentService;
use Modules\Courier\Services\DriverRegistry;

/**
 * The module's single wiring point.
 *
 * Register once in bootstrap/providers.php (Laravel 11+):
 *   Modules\Courier\CourierServiceProvider::class,
 *
 * Removing modules/courier/ plus that line and its composer.json entry removes
 * the couriers, the consignments and the schema. Orders keep working; they
 * simply have nobody assigned to carry them.
 */
class CourierServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Singletons so adapters registered during boot stay registered for the
        // whole request, rather than the registry being rebuilt per injection
        // site and losing them.
        $this->app->singleton(DriverRegistry::class);
        $this->app->singleton(ConsignmentService::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

        $this->app->booted(function (): void {
            if ($this->app->routesAreCached()) {
                return;
            }

            // `web`, matching the admin module: the panel authenticates with a
            // session cookie, and these routes sit behind the same guard.
            $this->app['router']
                ->middleware('web')
                ->prefix('api')
                ->group(__DIR__ . '/routes.php');
        });
    }
}
