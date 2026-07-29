<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Admin\Controllers\AdminAuthController;
use Modules\Admin\Controllers\AdminDashboardController;
use Modules\Admin\Controllers\AdminCustomerController;
use Modules\Admin\Controllers\AdminOrderController;
use Modules\Admin\Controllers\AdminProductController;

/**
 * Admin module routes — the module's entire routing surface.
 *
 * Everything except `login` sits behind the `admin` middleware. New admin
 * areas contributed by other modules register their own routes in their own
 * route files and apply `admin:<area>` themselves; this file never grows to
 * know about them.
 */

Route::prefix('admin')->name('admin.')->group(function (): void {

    // Handing out the CSRF cookie.
    //
    // Every admin page in this project is a STATIC html file — Laravel never
    // renders them, so it cannot inject the hidden @csrf field a Blade form
    // would carry. The panel still authenticates by session cookie and so still
    // runs through the `web` stack, which requires a token on every write.
    //
    // This endpoint closes that gap: a GET through `web` makes Laravel set the
    // XSRF-TOKEN cookie, and the client echoes it back in the X-XSRF-TOKEN
    // header on writes. That is the same handshake Sanctum's csrf-cookie route
    // performs, done here without pulling in the dependency for one cookie.
    //
    // Exempting the admin routes from CSRF instead would have been one line and
    // would have removed the protection from the highest-value surface on the
    // site.
    Route::get('/csrf', fn () => response()->noContent())->name('csrf');

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

        // Catalogue. Editing is scoped to the fields a merchant changes week to
        // week — identity fields (sku, barcode, origin, category) are not
        // editable here at all.
        Route::middleware('admin:products')->prefix('products')->name('products.')->group(function (): void {
            Route::get('/', [AdminProductController::class, 'index'])->name('index');
            Route::get('/{sku}', [AdminProductController::class, 'show'])->name('show');
            Route::patch('/{sku}', [AdminProductController::class, 'update'])->name('update');
        });
    });
});
