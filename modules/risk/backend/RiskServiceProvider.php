<?php

declare(strict_types=1);

namespace Modules\Risk;

use Illuminate\Support\ServiceProvider;

/**
 * The module's single wiring point.
 *
 * Outside modules/risk/ this module is named in exactly two places:
 * composer.json (PSR-4) and bootstrap/providers.php.
 *
 * IT OWNS NO TABLES. Every number on the Delivery risk screen is read from
 * `orders`, which the checkout module owns and this one only reads. That is
 * the whole design: a shop's record of who accepts parcels is not a second
 * database to keep in step with the first, it is the first one asked a
 * different question.
 *
 * So deleting this module deletes a screen and nothing else — no data, no
 * history, no flags left behind on anybody's orders.
 */
class RiskServiceProvider extends ServiceProvider
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

        // Admin routes: `web`, NOT `api`. The panel authenticates with a
        // session cookie, and the api group has no session — every request
        // through it would arrive unauthenticated and be answered with a 401.
        $this->app['router']
            ->middleware('web')
            ->prefix('api')
            ->group(__DIR__ . '/routes-admin.php');
    }
}
