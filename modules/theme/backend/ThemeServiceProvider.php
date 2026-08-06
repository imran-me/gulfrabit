<?php

declare(strict_types=1);

namespace Modules\Theme;

use Illuminate\Support\ServiceProvider;

/**
 * The module's single wiring point.
 *
 * Outside modules/theme/ this module is named in exactly three places:
 * composer.json (PSR-4), bootstrap/providers.php, and tools/assemble.py —
 * which links the stylesheet, ships the runtime script and builds the admin
 * screen.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Theme\ThemeServiceProvider::class,
 *
 * DELETING THIS MODULE IS SAFE. The storefront asks /api/theme and treats a
 * failure as "classic" — which is the theme the static HTML already ships and
 * the only one that exists without modules/theme/theme-luxe.css. Remove the
 * folder and its lines from assemble.py and the site is exactly the site it
 * was before the theme switch existed.
 */
class ThemeServiceProvider extends ServiceProvider
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

        // Public read: stateless, as an API should be.
        $this->app['router']
            ->middleware('api')
            ->prefix('api')
            ->group(__DIR__ . '/routes.php');

        // Admin writes: `web`, for the session cookie. See routes-admin.php.
        $this->app['router']
            ->middleware('web')
            ->prefix('api')
            ->group(__DIR__ . '/routes-admin.php');
    }
}
