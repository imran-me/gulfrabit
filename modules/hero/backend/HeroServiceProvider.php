<?php

declare(strict_types=1);

namespace Modules\Hero;

use Illuminate\Support\ServiceProvider;

/**
 * Hero module wiring.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Hero\HeroServiceProvider::class,
 *
 * Depends on nothing. It stores a link's PARTS (a product id, a category slug)
 * and builds the URL itself, so it never needs to ask the catalogue anything —
 * which is why deleting modules/catalog would break the destinations but not
 * this module, and deleting this module leaves the home page with the banners
 * authored into index.html.
 */
class HeroServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

        $this->app->booted(function (): void {
            if ($this->app->routesAreCached()) {
                return;
            }

            // `web`, matching every other module here: the panel authenticates
            // with a session cookie, and the public read rides the same stack
            // so one middleware group covers both.
            $this->app['router']
                ->middleware('web')
                ->prefix('api')
                ->group(__DIR__ . '/routes.php');
        });
    }
}
