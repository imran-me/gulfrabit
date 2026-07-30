<?php

declare(strict_types=1);

namespace Modules\Highlights;

use Illuminate\Support\ServiceProvider;

/**
 * The module's single wiring point.
 *
 * Outside modules/highlights/ this module is named in exactly two places:
 * composer.json (PSR-4) and bootstrap/providers.php.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Highlights\HighlightsServiceProvider::class,
 *
 * Deleting the module takes the curation with it and the home page goes back
 * to filling its rails from the `premium` / `new` tags, which is what it did
 * before this existed — modules/home/home.js treats the endpoint as optional.
 */
class HighlightsServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

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
