<?php

declare(strict_types=1);

namespace Modules\Checkout;

use Illuminate\Support\ServiceProvider;
use Modules\Checkout\Services\OrderService;

/**
 * Checkout module wiring. Same shape as Delivery, Catalog and Cart.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Checkout\CheckoutServiceProvider::class,
 *
 * Depends on Cart, Catalog and Delivery. That direction is fine and one-way:
 * none of those three knows checkout exists.
 */
class CheckoutServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(OrderService::class);
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
