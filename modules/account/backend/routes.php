<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Account\Controllers\AddressController;
use Modules\Account\Controllers\OrderHistoryController;
use Modules\Account\Controllers\WishlistController;

/**
 * Account module routes.
 *
 * All authenticated — everything here is one customer's private data.
 *
 * Order history is deliberately NOT here: orders belong to modules/checkout,
 * which already serves GET /api/orders. Re-exposing them under /account would
 * mean two places to keep in step and two places to get authorisation wrong.
 */

Route::prefix('account')->name('account.')->middleware('auth:sanctum')->group(function (): void {

    // The customer's own orders. Resolved through the signed-in user, so
    // there is no id in the URL that could be edited into someone else's
    // history — see the controller.
    Route::get('/orders', [OrderHistoryController::class, 'index'])->name('orders.index');

    Route::get('/addresses', [AddressController::class, 'index'])->name('addresses.index');
    Route::post('/addresses', [AddressController::class, 'store'])->name('addresses.store');
    Route::patch('/addresses/{id}', [AddressController::class, 'update'])->whereNumber('id')->name('addresses.update');
    Route::delete('/addresses/{id}', [AddressController::class, 'destroy'])->whereNumber('id')->name('addresses.destroy');
    Route::post('/addresses/{id}/default', [AddressController::class, 'makeDefault'])->whereNumber('id')->name('addresses.default');

    Route::get('/wishlist', [WishlistController::class, 'index'])->name('wishlist.index');
    Route::post('/wishlist', [WishlistController::class, 'store'])->name('wishlist.store');
    Route::delete('/wishlist/{sku}', [WishlistController::class, 'destroy'])->name('wishlist.destroy');
    // Called once, right after sign-in. Idempotent by the unique
    // (user_id, product_id) index, so a retry adds nothing twice.
    Route::post('/wishlist/merge', [WishlistController::class, 'merge'])->name('wishlist.merge');
});
