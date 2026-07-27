<?php

declare(strict_types=1);

namespace Modules\Bundle;

use Illuminate\Support\ServiceProvider;
use Modules\Bundle\Services\BundleService;

/**
 * The module's single wiring point.
 *
 * Routes and migrations are registered FROM INSIDE the module folder, so
 * removing modules/bundle/ removes the endpoint, the schema and the service
 * without editing any global file. Outside this folder the module is named in
 * exactly two places: composer.json (PSR-4) and bootstrap/providers.php.
 *
 * Register once in bootstrap/providers.php (Laravel 11+):
 *   Modules\Bundle\BundleServiceProvider::class,
 */
class BundleServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(BundleService::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

        $this->app->booted(function (): void {
            $this->loadRoutes();
        });
    }

    private function loadRoutes(): void
    {
        // Routes are cached in production; re-registering them would be a no-op
        // at best and a duplicate-name error at worst.
        if ($this->app->routesAreCached()) {
            return;
        }

        $this->app['router']
            ->middleware('api')
            ->prefix('api')
            ->group(__DIR__ . '/routes.php');
    }
}
