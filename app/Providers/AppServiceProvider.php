<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Fail loudly in development instead of silently returning null for a
        // relation nobody eager-loaded. Money code must not paper over an N+1
        // or a missing relation — see CartItem::currentUnitPricePoisha(), which
        // reads through to the product.
        Model::preventLazyLoading(! $this->app->isProduction());
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());
    }
}
