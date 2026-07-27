<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Courier\Controllers\AdminCourierController;

/**
 * Courier module routes — the module's entire routing surface.
 *
 * Mounted under the admin prefix and guarded by `admin:orders`: whoever may
 * work an order may hand it to a courier. Deleting modules/courier/ takes these
 * with it and leaves nothing dangling in admin's own route file, which is the
 * whole point of a module registering its own routes.
 */

Route::prefix('admin')->name('admin.')->middleware(['admin', 'admin:orders'])->group(function (): void {

    Route::get('/couriers', [AdminCourierController::class, 'index'])->name('couriers.index');

    Route::get('/orders/{order}/consignments', [AdminCourierController::class, 'forOrder'])
        ->name('consignments.forOrder');
    Route::post('/orders/{order}/consignments', [AdminCourierController::class, 'assign'])
        ->name('consignments.assign');

    Route::post('/consignments/{consignment}/status', [AdminCourierController::class, 'status'])
        ->name('consignments.status');
});
