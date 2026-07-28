<?php

declare(strict_types=1);

namespace Modules\Cms;

use Illuminate\Support\ServiceProvider;
use Modules\Cms\Services\ContentService;

/**
 * The module's single wiring point.
 *
 * Register once in bootstrap/providers.php (Laravel 11+):
 *   Modules\Cms\CmsServiceProvider::class,
 *
 * Removing modules/cms/ removes live editing. Every page keeps rendering
 * exactly as authored, because the authored HTML was always the content and
 * these rows were only ever overrides.
 */
class CmsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ContentService::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

        $this->app->booted(function (): void {
            if ($this->app->routesAreCached()) {
                return;
            }

            $this->app['router']
                ->middleware('web')
                ->prefix('api')
                ->group(__DIR__ . '/routes.php');
        });
    }
}
