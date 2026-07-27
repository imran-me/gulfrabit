<?php

declare(strict_types=1);

namespace Modules\B2b;

use Illuminate\Support\ServiceProvider;
use Modules\B2b\Services\QuoteService;

/**
 * B2B module wiring. Depends on Catalog (products and their tier pricing).
 * One-way: catalog knows nothing about B2B.
 *
 * Register in bootstrap/providers.php:
 *   Modules\B2b\B2bServiceProvider::class,
 */
class B2bServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(QuoteService::class);
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
