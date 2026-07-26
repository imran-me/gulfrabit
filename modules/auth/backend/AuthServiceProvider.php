<?php

declare(strict_types=1);

namespace Modules\Auth;

use Illuminate\Support\ServiceProvider;
use Modules\Auth\Services\AuthService;
use Modules\Auth\Services\OtpService;

/**
 * Auth module wiring. Same shape as every other module provider.
 *
 * Depends on Cart (to merge the guest basket on sign-in). One-way: Cart knows
 * nothing about Auth.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Auth\AuthServiceProvider::class,
 */
class AuthServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(OtpService::class);
        $this->app->singleton(AuthService::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

        $this->app->booted(function (): void {
            if ($this->app->routesAreCached()) {
                return;
            }

            $this->app['router']
                ->middleware('api')
                ->prefix('api')
                ->group(__DIR__ . '/routes.php');
        });
    }
}
