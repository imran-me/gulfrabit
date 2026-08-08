<?php

declare(strict_types=1);

namespace Modules\Payments;

use Illuminate\Support\ServiceProvider;
use Modules\Payments\Services\PaymentService;

/**
 * Payments module wiring. Same shape as Checkout, Cart and Courier.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Payments\PaymentsServiceProvider::class,
 *
 * Depends on Checkout (it reads and settles orders). One-way as always:
 * checkout does not know payments exists, and with this folder deleted the
 * shop still sells — everything simply pays on delivery, which is where the
 * shop started.
 */
class PaymentsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(PaymentService::class);
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
