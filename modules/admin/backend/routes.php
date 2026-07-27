<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Admin\Controllers\AdminAuthController;
use Modules\Admin\Controllers\AdminDashboardController;

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
    });
});
