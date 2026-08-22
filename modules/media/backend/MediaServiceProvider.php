<?php

declare(strict_types=1);

namespace Modules\Media;

use Illuminate\Support\ServiceProvider;
use Modules\Media\Console\BackfillTiers;
use Modules\Media\Services\FolderTree;
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
        $this->app->singleton(FolderTree::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

        // Console only, so the command does not exist on a web request.
        if ($this->app->runningInConsole()) {
            $this->commands([BackfillTiers::class]);
        }

        $this->app->booted(function (): void {
            $this->loadRoutes();
        });
    }

    private function loadRoutes(): void
    {
        if ($this->app->routesAreCached()) {
            return;
        }

        // `web`, NOT `api`: every route in this module is an admin route, and
        // the panel authenticates with a session cookie. The api group is
        // stateless, so requests through it arrive unauthenticated and
        // RequireAdmin answers 401 — which the panel shows as a login
        // redirect. Same mounting as modules/admin.
        $this->app['router']
            ->middleware('web')
            ->prefix('api')
            ->group(__DIR__ . '/routes.php');
    }
}
