<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\B2b\Controllers\AdminQuoteController;

/**
 * The B2B desk's inbox, inside the admin panel.
 *
 * `admin:orders` — whoever works orders works quote requests; they are the same
 * job at a different size. Deleting modules/b2b/ takes these with it.
 */
Route::prefix('admin')->name('admin.')->middleware(['admin', 'admin:orders'])->group(function (): void {
    Route::get('/quotes', [AdminQuoteController::class, 'index'])->name('quotes.index');
    Route::post('/quotes/{quoteRequest}/status', [AdminQuoteController::class, 'status'])->name('quotes.status');
});
