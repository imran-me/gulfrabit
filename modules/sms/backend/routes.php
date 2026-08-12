<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Sms\Controllers\AdminSmsController;

/**
 * SMS module routes — the module's entire routing surface.
 *
 * ADMIN ONLY, AND DELIBERATELY SO. The storefront never sends an SMS from the
 * browser: a gateway key that reaches page JS is a gateway key someone else is
 * now using. Nothing here is reachable without an admin session.
 *
 * Guarded by `admin:orders` — whoever may work an order may tell the customer
 * about it. Sending is throttled on top of that, because prepaid credit is
 * spendable and a stuck send button should cost a few taka, not a few thousand.
 *
 * Deleting modules/sms/ takes these routes with it and leaves nothing dangling
 * in admin's own route file.
 */

Route::prefix('admin')->name('admin.')->middleware(['admin', 'admin:orders'])->group(function (): void {

    Route::get('/orders/{order}/messages', [AdminSmsController::class, 'index'])
        ->name('messages.index');

    Route::post('/orders/{order}/messages', [AdminSmsController::class, 'store'])
        ->middleware('throttle:20,1')
        ->name('messages.store');
});
