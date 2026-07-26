<?php

declare(strict_types=1);

namespace Modules\Delivery;

use Illuminate\Support\ServiceProvider;
use Modules\Delivery\Services\DeliveryQuoteService;

/**
 * The module's single wiring point.
 *
 * This is what makes the module rule real: routes and migrations are registered
 * FROM INSIDE the module folder, so removing modules/delivery/ removes the whole
 * feature — endpoints, schema and services — without editing a global routes or
 * config file. Nothing outside this folder knows delivery exists except the one
 * provider entry that loads it.
 *
 * Register once in bootstrap/providers.php (Laravel 11+):
 *   Modules\Delivery\DeliveryServiceProvider::class,
 */
class DeliveryServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Stateless and cheap to build, but shared so its cache warms once per
        // request rather than per injection site.
        $this->app->singleton(DeliveryQuoteService::class);
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
