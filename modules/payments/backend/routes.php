<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Payments\Controllers\PaymentController;

/**
 * Payments module routes.
 *
 * All public: guest checkout is the default path, and the callback arrives
 * from a redirect we do not control the authentication of. What keeps this
 * safe is that NOTHING here trusts its input for the money decision — the
 * paid/not-paid verdict always comes from a server-to-server call to the
 * gateway, never from a query string.
 */

Route::prefix('payments')->name('payments.')->group(function (): void {

    Route::get('/methods', [PaymentController::class, 'methods'])
        ->name('methods');

    // Rate-limited like order placement: it writes money-bearing rows.
    Route::post('/intent', [PaymentController::class, 'intent'])
        ->middleware('throttle:10,1')
        ->name('intent');

    // Generous throttle — gateways may bounce a browser through more than
    // once, and a customer refreshing the return page must not be locked out
    // of their own verdict.
    Route::get('/callback/{gateway}', [PaymentController::class, 'callback'])
        ->middleware('throttle:30,1')
        ->whereIn('gateway', ['bkash', 'nagad'])
        ->name('callback');
});
