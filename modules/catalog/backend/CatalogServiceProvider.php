<?php

declare(strict_types=1);

namespace Modules\Catalog;

use Illuminate\Support\ServiceProvider;
use Modules\Catalog\Services\ProductQueryService;

/**
 * Catalog module wiring. Mirrors DeliveryServiceProvider deliberately — every
 * module provider should look the same, so a developer who has read one has
 * read them all.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Catalog\CatalogServiceProvider::class,
 */
class CatalogServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ProductQueryService::class);
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
