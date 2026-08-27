<?php

declare(strict_types=1);

namespace Modules\Admin;

use Illuminate\Support\ServiceProvider;
use Modules\Admin\Middleware\RequireAdmin;
use Modules\Admin\Models\AdminUser;
use Modules\Admin\Services\AdminAuthService;

/**
 * The module's single wiring point.
 *
 * Registers its own auth guard as well as its routes and migrations, so the
 * `admin` guard exists only while this module does. Removing modules/admin/
 * removes the panel, its schema, its endpoints AND its guard, leaving no
 * dangling reference in config/auth.php.
 *
 * Register once in bootstrap/providers.php (Laravel 11+):
 *   Modules\Admin\AdminServiceProvider::class,
 */
class AdminServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(AdminAuthService::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');
        $this->registerGuard();

        $this->app['router']->aliasMiddleware('admin', RequireAdmin::class);

        /* `admin.owner` used to be registered here, and every destructive
           route in the panel carried it. It is gone: deleting is no longer
           "are you an owner" but a permission per area — `admin:orders.delete`,
           `admin:products.delete` — which is what makes "this person may work
           orders but not delete them" expressible at all.

           The middleware class went with it rather than being left registered
           and unused, because an alias nothing calls is an alias somebody
           eventually calls by mistake, reintroducing an owner-only gate into a
           panel that no longer works that way. */

        $this->app->booted(function (): void {
            $this->loadRoutes();
        });
    }

    /**
     * A separate `admin` guard over a separate provider.
     *
     * Declared here rather than in config/auth.php so the module stays
     * self-contained. Both are session guards on the same browser, which is
     * intentional: a staff member can be signed into the storefront as a
     * customer and into the panel as staff at the same time without either
     * session standing in for the other.
     */
    private function registerGuard(): void
    {
        config([
            'auth.providers.admin_users' => [
                'driver' => 'eloquent',
                'model'  => AdminUser::class,
            ],
            'auth.guards.admin' => [
                'driver'   => 'session',
                'provider' => 'admin_users',
            ],
        ]);
    }

    private function loadRoutes(): void
    {
        if ($this->app->routesAreCached()) {
            return;
        }

        // `web` middleware, not `api`: the panel authenticates with a session
        // cookie, which needs the session and CSRF stack that the api group
        // deliberately omits. The URLs still live under /api/ so one .htaccess
        // rule keeps routing them to Laravel.
        $this->app['router']
            ->middleware('web')
            ->prefix('api')
            ->group(__DIR__ . '/routes.php');
    }
}
