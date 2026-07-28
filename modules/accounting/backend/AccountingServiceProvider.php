<?php

declare(strict_types=1);

namespace Modules\Accounting;

use Illuminate\Support\ServiceProvider;
use Modules\Accounting\Services\LedgerService;
use Modules\Accounting\Services\OrderPostingService;
use Modules\Accounting\Services\ReportService;

/**
 * The module's single wiring point.
 *
 * Register once in bootstrap/providers.php (Laravel 11+):
 *   Modules\Accounting\AccountingServiceProvider::class,
 *
 * Removing modules/accounting/ removes the books. Trade carries on — orders
 * still ship, refunds still happen — they simply stop being recorded in a
 * ledger. Nothing else depends on this module.
 */
class AccountingServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(LedgerService::class);
        $this->app->singleton(ReportService::class);
        $this->app->singleton(OrderPostingService::class);
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
