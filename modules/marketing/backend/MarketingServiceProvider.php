<?php

declare(strict_types=1);

namespace Modules\Marketing;

use Illuminate\Support\ServiceProvider;
use Modules\Marketing\Console\StampPixel;
use Modules\Marketing\Console\SyncAdSpend;
use Modules\Marketing\Services\MetaPixelSettings;
use Modules\Marketing\Services\PixelStamp;

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
    public function register(): void
    {
        // PixelStamp is plain PHP with no container awareness of its own — it
        // is told where the site is, which is what lets it be tested against a
        // copy of the pages. The site root is the Laravel root: index.html and
        // modules/ sit beside artisan.
        $this->app->singleton(PixelStamp::class, fn (): PixelStamp => new PixelStamp(base_path()));

        // Scoped rather than a plain singleton: identical within one request or
        // one artisan run, but forgotten between the requests or jobs of a
        // long-lived worker, so its memoised answer can never outlive a save
        // made somewhere else.
        $this->app->scoped(MetaPixelSettings::class);
    }

    public function boot(): void
    {
        // Every other module with a table says this; this one did not, so
        // `migrate` — which only knows the paths providers hand it — never saw
        // tracking_events. TrackController swallowed the missing table on
        // every event by design, so the only symptom was a dashboard with
        // nothing to read.
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

        // Console only, so the command does not exist on a web request.
        // deploy.sh runs it after every `git reset --hard`.
        if ($this->app->runningInConsole()) {
            // StampPixel runs on every deploy; SyncAdSpend on a daily cron, so
            // a window nobody pressed the button for still has its spend.
            $this->commands([StampPixel::class, SyncAdSpend::class]);
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
