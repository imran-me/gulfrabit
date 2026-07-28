<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Controllers\AdminStockController;

/**
 * Inventory routes — the module's entire routing surface.
 *
 * `admin:inventory`, which owner, manager and warehouse hold. Warehouse staff
 * move stock; that is the job, and it is why the role exists.
 */

Route::prefix('admin')->name('admin.')->middleware(['admin', 'admin:inventory'])->group(function (): void {

    Route::get('/warehouses', [AdminStockController::class, 'warehouses'])->name('warehouses.index');

    Route::get('/stock', [AdminStockController::class, 'index'])->name('stock.index');
    Route::get('/stock/{sku}/movements', [AdminStockController::class, 'movements'])->name('stock.movements');

    // Every write is a movement with a reason. There is deliberately no
    // "set quantity to N" endpoint — see AdminStockController.
    Route::post('/stock/movements', [AdminStockController::class, 'store'])->name('stock.store');
    Route::post('/stock/recount', [AdminStockController::class, 'recount'])->name('stock.recount');
});
