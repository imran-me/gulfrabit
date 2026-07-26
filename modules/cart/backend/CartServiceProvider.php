<?php

declare(strict_types=1);

namespace Modules\Cart;

use Illuminate\Support\ServiceProvider;
use Modules\Cart\Services\CartService;
use Modules\Cart\Services\PromotionService;

/**
 * Cart module wiring. Same shape as Delivery and Catalog on purpose.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Cart\CartServiceProvider::class,
 */
class CartServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(PromotionService::class);
        $this->app->singleton(CartService::class);
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
