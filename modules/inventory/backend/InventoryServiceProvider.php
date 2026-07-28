<?php

declare(strict_types=1);

namespace Modules\Inventory;

use Illuminate\Support\ServiceProvider;
use Modules\Inventory\Services\StockService;

/**
 * The module's single wiring point.
 *
 * Register once in bootstrap/providers.php (Laravel 11+):
 *   Modules\Inventory\InventoryServiceProvider::class,
 *
 * Removing modules/inventory/ removes stock tracking. Products keep their
 * `in_stock` flag, so the storefront carries on selling — it simply stops
 * knowing how many are left.
 */
class InventoryServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(StockService::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

        $this->app->booted(function (): void {
            if ($this->app->routesAreCached()) {
                return;
            }

            $this->app['router']
                ->middleware('web')
                ->prefix('api')
                ->group(__DIR__ . '/routes.php');
        });
    }
}
