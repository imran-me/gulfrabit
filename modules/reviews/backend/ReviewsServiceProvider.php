<?php

declare(strict_types=1);

namespace Modules\Reviews;

use Illuminate\Support\ServiceProvider;
use Modules\Reviews\Services\ReviewService;

/**
 * The module's single wiring point.
 *
 * Outside modules/reviews/ this module is named in exactly two places:
 * composer.json (PSR-4) and bootstrap/providers.php.
 *
 * Removing the module leaves the product_reviews table and the last computed
 * rating on each product — the same way removing modules/media leaves the
 * uploads. The storefront's review section is loaded with a dynamic import
 * and a .catch, so a product page without this module renders everything
 * except the reviews.
 */
class ReviewsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ReviewService::class);
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

        // `web`, NOT `api`: the storefront and the panel both authenticate
        // with a session cookie. Same mounting as modules/media — see the note
        // there for what goes wrong under the stateless group.
        $this->app['router']
            ->middleware('web')
            ->prefix('api')
            ->group(__DIR__ . '/routes.php');
    }
}
