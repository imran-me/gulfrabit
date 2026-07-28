<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\Accounting\Controllers\AdminAccountingController;

/**
 * Accounting routes — the module's entire routing surface.
 *
 * `admin:accounting`, held by owner, manager and accounts. Warehouse never
 * reaches these, which is the point of that role existing.
 *
 * Note what is missing: no PUT or PATCH on a journal entry, and no DELETE. A
 * posted entry is corrected by reversing it. Leaving the route out is a
 * stronger guarantee than leaving it in and checking a flag.
 */

Route::prefix('admin/accounting')->name('admin.accounting.')
    ->middleware(['admin', 'admin:accounting'])->group(function (): void {

        Route::get('/accounts', [AdminAccountingController::class, 'accounts'])->name('accounts');
        Route::get('/journal', [AdminAccountingController::class, 'journal'])->name('journal');
        Route::get('/trial-balance', [AdminAccountingController::class, 'trialBalance'])->name('trial');
        Route::get('/profit-and-loss', [AdminAccountingController::class, 'profitAndLoss'])->name('pnl');

        Route::post('/expenses', [AdminAccountingController::class, 'recordExpense'])->name('expenses.store');
        Route::post('/journal/{entry}/reverse', [AdminAccountingController::class, 'reverse'])->name('reverse');
    });
