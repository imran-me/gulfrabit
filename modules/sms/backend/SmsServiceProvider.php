<?php

declare(strict_types=1);

namespace Modules\Sms;

use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;
use Modules\Checkout\Events\OrderStatusChanged;
use Modules\Sms\Listeners\SendOrderStatusSms;
use Modules\Sms\Services\SmsService;

/**
 * SMS module wiring.
 *
 * Register in bootstrap/providers.php:
 *   Modules\Sms\SmsServiceProvider::class,
 *
 * Depends on Checkout (it listens to checkout's OrderStatusChanged event).
 * One-way, as always: checkout does not know this module exists, and deleting
 * this folder simply leaves that event with no audience.
 *
 * No routes. The storefront never sends SMS from the browser — a gateway key
 * that reaches page JS is a gateway key someone else is now using.
 */
class SmsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(SmsService::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__ . '/Migrations');

        Event::listen(OrderStatusChanged::class, SendOrderStatusSms::class);
    }
}
