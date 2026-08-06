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

        // Public storefront routes: stateless, as an API should be.
        $this->app['router']
            ->middleware('api')
            ->prefix('api')
            ->group(__DIR__ . '/routes.php');

        // Admin routes: `web`, NOT `api`. The panel authenticates with a
        // session cookie, and the api group has no session — every request
        // through it arrives unauthenticated, RequireAdmin answers 401, and
        // the panel redirects to login. Same mounting as modules/admin.
        $this->app['router']
            ->middleware('web')
            ->prefix('api')
            ->group(__DIR__ . '/routes-admin.php');
    }
}
