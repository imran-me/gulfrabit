<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Admin\Controllers\AdminAuthController;
use Modules\Admin\Controllers\AdminDashboardController;
use Modules\Admin\Controllers\AdminCustomerController;
use Modules\Admin\Controllers\AdminOrderController;

/**
 * Admin module routes — the module's entire routing surface.
 *
 * Everything except `login` sits behind the `admin` middleware. New admin
 * areas contributed by other modules register their own routes in their own
 * route files and apply `admin:<area>` themselves; this file never grows to
 * know about them.
 */

Route::prefix('admin')->name('admin.')->group(function (): void {

    // Public, and heavily throttled. Five staff accounts exist; nobody needs
    // more than a handful of attempts a minute, and the limit is per IP AND
    // the account lock is per account, so neither axis alone gets an attacker
    // very far.
    Route::post('/login', [AdminAuthController::class, 'login'])
        ->middleware('throttle:10,1')
        ->name('login');

    Route::middleware('admin')->group(function (): void {
        Route::post('/logout', [AdminAuthController::class, 'logout'])->name('logout');
        Route::get('/me', [AdminAuthController::class, 'me'])->name('me');

        // The dashboard aggregates across modules that may not be installed,
        // so the controller asks each one and skips what is absent.
        Route::get('/dashboard', [AdminDashboardController::class, 'index'])->name('dashboard');

        // Orders. `admin:orders` on the group, so a role without the capability
        // never reaches the controller — including the roles that exist today
        // and the ones added later.
        Route::middleware('admin:orders')->prefix('orders')->name('orders.')->group(function (): void {
            Route::get('/', [AdminOrderController::class, 'index'])->name('index');
            Route::get('/{order}', [AdminOrderController::class, 'show'])->name('show');
            Route::post('/{order}/transition', [AdminOrderController::class, 'transition'])->name('transition');
            // Refunds carry a second, narrower check inside the controller:
            // `orders` gets you the screen, it does not get you the money.
            Route::post('/{order}/refund', [AdminOrderController::class, 'refund'])->name('refund');
        });

        // Customers. The most sensitive area in the panel — a searchable index
        // of everyone who has ever bought something, with phone numbers. Only
        // `owner` and `manager` hold the `customers` capability.
        Route::middleware('admin:customers')->prefix('customers')->name('customers.')->group(function (): void {
            Route::get('/', [AdminCustomerController::class, 'index'])->name('index');
            Route::get('/{user}', [AdminCustomerController::class, 'show'])->name('show');
            Route::post('/{user}/notes', [AdminCustomerController::class, 'addNote'])->name('notes.store');
            // Irreversible, and it edits historical order records. A second,
            // narrower check inside the controller restricts it to owners.
            Route::post('/{user}/forget', [AdminCustomerController::class, 'forget'])->name('forget');
        });
    });
});
