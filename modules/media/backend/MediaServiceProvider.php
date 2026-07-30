<?php

declare(strict_types=1);

namespace Modules\Media;

use Illuminate\Support\ServiceProvider;
use Modules\Media\Services\ImageStore;

/**
 * The module's single wiring point.
 *
 * Outside modules/media/ this module is named in exactly two places:
 * composer.json (PSR-4) and bootstrap/providers.php.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Media\MediaServiceProvider::class,
 *
 * Removing the module leaves the uploaded files in /uploads and the rows in
 * media_assets — the same way removing a module does not drop its tables.
 * Consumers store a plain path string, never a relation, so a category with an
 * image keeps working; it simply loses the ability to change it.
 */
class MediaServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ImageStore::class);
    }

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
