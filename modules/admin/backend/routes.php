<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Admin\Controllers\AdminAuthController;
use Modules\Admin\Controllers\AdminDashboardController;
use Modules\Admin\Controllers\AdminHealthController;
use Modules\Admin\Controllers\AdminCategoryController;
use Modules\Admin\Controllers\AdminCustomerController;
use Modules\Admin\Controllers\AdminOrderController;
use Modules\Admin\Controllers\AdminProductController;
use Modules\Admin\Controllers\AdminPromotionController;
use Modules\Admin\Controllers\AdminStaffController;

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

        // Changing your OWN password. Behind `admin` only — every role needs
        // this, and it is what stops a generated password being permanent.
        // Throttled because it takes a guess at the current password, which
        // makes it one more place worth grinding at.
        Route::post('/password', [AdminAuthController::class, 'changePassword'])
            ->middleware('throttle:10,1')
            ->name('password');

        // The dashboard aggregates across modules that may not be installed,
        // so the controller asks each one and skips what is absent.
        Route::get('/dashboard', [AdminDashboardController::class, 'index'])->name('dashboard');

        // "Is the server actually set up?" — any signed-in staff member, so
        // whoever is looking at a broken screen can answer it themselves
        // instead of asking for a cron job and a log file.
        Route::get('/health', [AdminHealthController::class, 'index'])->name('health');

        // Orders. `admin:orders` on the group, so a role without the capability
        // never reaches the controller — including the roles that exist today
        // and the ones added later.
        Route::middleware('admin:orders')->prefix('orders')->name('orders.')->group(function (): void {
            Route::get('/', [AdminOrderController::class, 'index'])->name('index');
            // withTrashed, so a deleted order still opens from the Deleted tab.
            // Without it the link in that tab 404s, and "I can see it in the
            // list but I cannot open it to decide whether to restore it" is a
            // worse screen than not having the tab.
            Route::get('/{order}', [AdminOrderController::class, 'show'])->withTrashed()->name('show');
            Route::post('/{order}/transition', [AdminOrderController::class, 'transition'])
                ->middleware('admin:orders.edit')->name('transition');
            // Internal notes. Anyone who may work an order may write on it —
            // the warehouse noting "box crushed, repacked" is exactly the kind
            // of thing that must not need a manager to type it.
            Route::post('/{order}/notes', [AdminOrderController::class, 'addNote'])
                ->middleware('admin:orders.edit')->name('notes.store');
            // Refunds carry a second, narrower check inside the controller:
            // `orders` gets you the screen, it does not get you the money.
            Route::post('/{order}/refund', [AdminOrderController::class, 'refund'])->name('refund');

            // Deleting is its own permission now — per area, per account —
            // rather than "are you an owner". `admin:orders` above gets you the
            // screen; this gets you the button. Soft only: the row, its items,
            // its timeline and its refunds all stay, and restore puts it back
            // in the stage it left from.
            Route::middleware('admin:orders.delete')->group(function (): void {
                // withTrashed here too, so deleting something already
                // deleted answers "that order is already deleted" rather than
                // a bare 404 that reads as "no such order".
                Route::delete('/{order}', [AdminOrderController::class, 'destroy'])
                    ->withTrashed()->name('destroy');
                Route::post('/{order}/restore', [AdminOrderController::class, 'restore'])->name('restore');
            });
        });

        // Customers. The most sensitive area in the panel — a searchable index
        // of everyone who has ever bought something, with phone numbers. Only
        // `owner` and `manager` hold the `customers` capability.
        Route::middleware('admin:customers')->prefix('customers')->name('customers.')->group(function (): void {
            Route::get('/', [AdminCustomerController::class, 'index'])->name('index');
            Route::get('/{user}', [AdminCustomerController::class, 'show'])->withTrashed()->name('show');
            Route::post('/{user}/notes', [AdminCustomerController::class, 'addNote'])
                ->middleware('admin:customers.edit')->name('notes.store');
            // Irreversible, and it edits historical order records. A second,
            // narrower check inside the controller restricts it to owners.
            Route::post('/{user}/forget', [AdminCustomerController::class, 'forget'])->name('forget');

            // Deleting is the reversible one — off the list, everything kept.
            // `forget` above is the irreversible one, behind `customers.erase`.
            // Two acts, two permissions, and neither is a synonym for the other.
            Route::middleware('admin:customers.delete')->group(function (): void {
                Route::delete('/{user}', [AdminCustomerController::class, 'destroy'])
                    ->withTrashed()->name('destroy');
                Route::post('/{user}/restore', [AdminCustomerController::class, 'restore'])->name('restore');
            });
        });

        // Catalogue. Editing is scoped to the fields a merchant changes week to
        // week — identity fields (sku, barcode, origin, category) are not
        // editable here at all.
        Route::middleware('admin:products')->prefix('products')->name('products.')->group(function (): void {
            Route::get('/', [AdminProductController::class, 'index'])->name('index');
            Route::post('/', [AdminProductController::class, 'store'])
                ->middleware('admin:products.edit')->name('store');
            Route::get('/{sku}', [AdminProductController::class, 'show'])->name('show');
            Route::patch('/{sku}', [AdminProductController::class, 'update'])
                ->middleware('admin:products.edit')->name('update');

            // Archiving is not a delete and is not gated like one — it is
            // reversible and destroys nothing. It does get its own permission
            // though, separate from `edit`: a shop may well want somebody who
            // can put the season away without being able to change a price.
            Route::middleware('admin:products.archive')->group(function (): void {
                Route::post('/{sku}/archive', [AdminProductController::class, 'archive'])->name('archive');
                Route::post('/{sku}/unarchive', [AdminProductController::class, 'unarchive'])->name('unarchive');
            });
            // Unlists — soft delete, so past orders keep their product. The
            // route below puts it back.
            //
            // Behind `products.delete` like every other delete in the panel.
            // This pair was once left open while the rest were gated, which
            // meant the products screen hid its Remove button and then accepted
            // the request anyway if one was sent. A hidden control is not a
            // permission.
            Route::middleware('admin:products.delete')->group(function (): void {
                Route::delete('/{sku}', [AdminProductController::class, 'destroy'])->name('destroy');
                Route::post('/{sku}/restore', [AdminProductController::class, 'restore'])->name('restore');
                // The bin's own delete. Reachable only for a product already
                // in the bin, and it answers 409 with the count of what it
                // would erase until ?confirm=1 says go — see purge().
                Route::delete('/{sku}/permanent', [AdminProductController::class, 'purge'])->name('purge');
            });
        });

        // Coupons and offers. Bound by `code`, not id: the code is what the
        // merchant and the customer both say out loud, and an id in the URL
        // would be one more thing that means nothing to either of them.
        Route::middleware('admin:products')->prefix('promotions')->name('promotions.')->group(function (): void {
            Route::get('/', [AdminPromotionController::class, 'index'])->name('index');
            Route::post('/', [AdminPromotionController::class, 'store'])
                ->middleware('admin:products.edit')->name('store');
            Route::patch('/{promotion:code}', [AdminPromotionController::class, 'update'])
                ->middleware('admin:products.edit')->name('update');
            // Refused once the code has been used — see the controller. Soft,
            // and it switches the code off on the way out, so restoring never
            // hands back a live discount.
            Route::middleware('admin:products.delete')->group(function (): void {
                Route::delete('/{promotion:code}', [AdminPromotionController::class, 'destroy'])->name('destroy');
                Route::post('/{promotion}/restore', [AdminPromotionController::class, 'restore'])->name('restore');
            });
        });

        // Categories. Same capability as products — whoever curates the
        // catalogue curates the shelves it sits on.
        Route::middleware('admin:products')->prefix('categories')->name('categories.')->group(function (): void {
            Route::get('/', [AdminCategoryController::class, 'index'])->name('index');
            Route::post('/', [AdminCategoryController::class, 'store'])
                ->middleware('admin:products.edit')->name('store');
            Route::patch('/{category}', [AdminCategoryController::class, 'update'])
                ->middleware('admin:products.edit')->name('update');
            // Refuses while products or sub-categories are attached — see the
            // controller. Soft, so the third case those guards cannot cover —
            // deleting the right kind of category by mistake — has a way back.
            Route::middleware('admin:products.delete')->group(function (): void {
                Route::delete('/{category}', [AdminCategoryController::class, 'destroy'])->name('destroy');
                Route::post('/{category}/restore', [AdminCategoryController::class, 'restore'])->name('restore');
            });
        });

        // Staff accounts — who works here, and what each of them may do.
        //
        // `admin:staff` gets you the list; `admin:staff.manage` gets you
        // the power to change it. By default only `owner` holds either, but
        // both are now grantable per account — see AdminUser::PERMISSIONS.
        // There is no delete gate here because nothing in here deletes: staff
        // accounts are disabled, never removed, so an ex-employee's name stays
        // attached to the stock movements and order transitions they made —
        // see AdminStaffController's docblock.
        Route::middleware('admin:staff')->prefix('staff')->name('staff.')->group(function (): void {
            // Reading who works here and changing what they may do are two
            // different powers, so they are two permissions. `staff.view`
            // without `staff.manage` is a real thing to hand somebody — a
            // second owner who should see the list but not rewrite it.
            Route::get('/', [AdminStaffController::class, 'index'])->name('index');

            Route::middleware('admin:staff.manage')->group(function (): void {
                Route::post('/', [AdminStaffController::class, 'store'])->name('store');
                Route::patch('/{staff}', [AdminStaffController::class, 'update'])->name('update');

            // POST, not PATCH. A reset does not edit a field somebody supplied
            // — it MINTS a credential and hands it back once, which is a
            // different kind of act and deserves a URL that says so.
                Route::post('/{staff}/password', [AdminStaffController::class, 'resetPassword'])
                    ->name('password');

            // Clears the five-failures lockout without touching the password.
                Route::post('/{staff}/unlock', [AdminStaffController::class, 'unlock'])->name('unlock');

            // The panel's version of removing somebody. There is deliberately
            // no DELETE on this resource anywhere in this file.
                Route::post('/{staff}/disable', [AdminStaffController::class, 'disable'])->name('disable');
                Route::post('/{staff}/enable', [AdminStaffController::class, 'enable'])->name('enable');
            });
        });
    });
});
