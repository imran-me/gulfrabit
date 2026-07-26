<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Cart\Controllers\CartController;

/**
 * Cart module routes — the module's entire routing surface.
 *
 * Public, because the cart is guest-first: checkout is guest-by-default in this
 * market, so requiring auth to hold a basket would block a large share of
 * orders. Identity comes from an httpOnly guest-token cookie, or the
 * authenticated user when there is one.
 */

Route::prefix('cart')->name('cart.')->group(function (): void {

    Route::get('/', [CartController::class, 'show'])->name('show');

    Route::post('/items', [CartController::class, 'addItem'])
        ->middleware('throttle:60,1')
        ->name('items.add');

    Route::patch('/items/{lineId}', [CartController::class, 'updateItem'])
        ->whereNumber('lineId')
        ->name('items.update');

    Route::delete('/items/{lineId}', [CartController::class, 'removeItem'])
        ->whereNumber('lineId')
        ->name('items.remove');

    Route::delete('/', [CartController::class, 'clear'])->name('clear');

    // Promo attempts are guessable, so rate-limit harder than the rest.
    Route::post('/promo', [CartController::class, 'applyPromo'])
        ->middleware('throttle:20,1')
        ->name('promo.apply');

    Route::delete('/promo', [CartController::class, 'removePromo'])->name('promo.remove');

    // Called once, immediately after login, to fold the guest basket in.
    Route::post('/merge', [CartController::class, 'merge'])
        ->middleware('auth:sanctum')
        ->name('merge');
});
