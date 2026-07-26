<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Checkout\Controllers\OrderController;

/**
 * Checkout module routes.
 *
 * Placing an order is public: guest checkout is the default path in this
 * market, and requiring an account to buy would cost a large share of orders.
 * Reading an order back is not public — see OrderController::show().
 */

Route::prefix('orders')->name('orders.')->group(function (): void {

    // Rate-limited: this is the endpoint that writes money-bearing rows.
    Route::post('/', [OrderController::class, 'store'])
        ->middleware('throttle:10,1')
        ->name('store');

    // Guest tracking needs order number + the phone that placed it.
    Route::get('/{order}', [OrderController::class, 'show'])
        ->middleware('throttle:30,1')
        ->name('show');

    Route::get('/', [OrderController::class, 'index'])
        ->middleware('auth:sanctum')
        ->name('index');
});
