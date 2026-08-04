<?php

declare(strict_types=1);

namespace Modules\Marketing;

use Illuminate\Support\ServiceProvider;

/**
 * The module's single wiring point.
 *
 * Outside modules/marketing/ this module is named in exactly two places:
 * composer.json (PSR-4) and bootstrap/providers.php.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Marketing\MarketingServiceProvider::class,
 *
 * Deleting the module costs the server half of ad tracking and nothing else:
 * the browser pixel keeps firing on its own, and analytics.js already treats
 * POST /api/track as optional — its circuit breaker notices the 404 once per
 * page and stops calling. No storefront page imports anything from here.
 */
class MarketingServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->app->booted(function (): void {
            $this->loadRoutes();
        });
    }

    private function loadRoutes(): void
    {
        if ($this->app->routesAreCached()) {
            return;
        }

        $this->app['router']
            ->middleware('api')
            ->prefix('api')
            ->group(__DIR__ . '/routes.php');
    }
}
