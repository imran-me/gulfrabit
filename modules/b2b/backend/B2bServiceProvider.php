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

            // The admin inbox is a SEPARATE file on the `web` stack. The
            // storefront's quote endpoints are stateless JSON and belong on
            // `api`; the panel authenticates with a session cookie, which needs
            // the session and CSRF middleware `api` deliberately omits. One
            // file cannot be on both stacks, so there are two.
            $this->app['router']
                ->middleware('web')
                ->prefix('api')
                ->group(__DIR__ . '/admin-routes.php');
        });
    }
}
